"""Deep browser catalogue scan for Nexora PRO imports.

This extends the fast scanner with rendered pagination, infinite-scroll discovery,
listing-card extraction, sitemap/product-page crawling and source-aware de-duplication.
It never bypasses login, CAPTCHA or private APIs.
"""
import re
from urllib.parse import urlparse, urlunparse

from fastapi import HTTPException

import universal_store_scanner as universal
import browser_store_scanner as browser

MAX_LISTING_PAGES = 12
MAX_PRODUCT_PAGES = 160
MAX_SCROLL_ROUNDS = 14

CARD_SCRIPT = r"""
() => {
  const cards = Array.from(document.querySelectorAll(
    '[data-product-id], [data-product], article, li, [class*="product" i], [class*="card" i]'
  )).slice(0, 1200);
  const out = [];
  for (const card of cards) {
    const a = card.querySelector('a[href]');
    const titleEl = card.querySelector('h1,h2,h3,h4,[class*="title" i],[data-testid*="title" i]');
    const img = card.querySelector('img');
    const text = (card.innerText || '').replace(/\s+/g,' ').trim();
    if (!a || !titleEl || text.length < 3) continue;
    const priceText = Array.from(card.querySelectorAll(
      '[itemprop="price"],[data-price],[class*="price" i],[data-testid*="price" i]'
    )).map((x)=>x.getAttribute('content')||x.getAttribute('data-price')||x.textContent||'').join(' | ');
    const href = a.href;
    const title = (titleEl.textContent || '').replace(/\s+/g,' ').trim();
    const srcset = img ? (img.getAttribute('data-srcset') || img.getAttribute('srcset') || '').split(',')[0].trim().split(' ')[0] : '';
    const image = img ? (img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || srcset || img.currentSrc || img.src || '') : '';
    if (href && title && priceText) out.push({href,title,priceText,image,text:text.slice(0,1800)});
  }
  return out;
}
"""

NEXT_SCRIPT = r"""
() => {
  const candidates = Array.from(document.querySelectorAll('a[href],button'));
  for (const el of candidates) {
    const label = ((el.getAttribute('aria-label')||'')+' '+(el.textContent||'')).trim().toLowerCase();
    if (/^(next|next page|older|more|›|»)$/.test(label) || /next page/.test(label)) {
      if (el.tagName === 'A' && el.href) return {type:'href', value:el.href};
      return {type:'click', value:null};
    }
  }
  return null;
}
"""


def _clean_url(url):
    p = urlparse(url)
    return urlunparse((p.scheme, p.netloc, p.path, '', p.query, ''))


def _card_products(raw_cards, platform='browser-card'):
    products = []
    links = []
    for card in raw_cards or []:
        href = card.get('href') or ''
        if not href:
            continue
        links.append(href)
        price = universal._number(card.get('priceText'))
        if price is None or price <= 0:
            continue
        item = universal._product(
            platform,
            href,
            href,
            card.get('title'),
            price,
            description=card.get('text') or '',
            images=[card.get('image')] if card.get('image') else [],
            stock=0,
            stock_known=False,
            category='',
            brand='',
        )
        if item:
            products.append(item)
    return universal._dedupe(products), links


def _scroll_collect(page):
    products = []
    links = []
    last_height = 0
    stagnant = 0
    for _ in range(MAX_SCROLL_ROUNDS):
        try:
            raw = page.evaluate(CARD_SCRIPT)
            found, found_links = _card_products(raw)
            products.extend(found)
            links.extend(found_links)
            height = page.evaluate('document.body ? document.body.scrollHeight : 0')
            if height == last_height:
                stagnant += 1
            else:
                stagnant = 0
            last_height = height
            if stagnant >= 2:
                break
            page.mouse.wheel(0, 2400)
            page.wait_for_timeout(650)
        except Exception:
            break
    return universal._dedupe(products), list(dict.fromkeys(links))


def deep_browser_scan_sync(raw_url):
    origin = universal._origin(raw_url)
    universal._assert_public(origin)
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return {
            'website_url': raw_url,
            'platform': 'browser-unavailable',
            'products': [],
            'manual_required': True,
            'challenge_type': 'browser_setup',
            'manual_message': 'Browser scanning is not installed. Install backend requirements and Playwright Chromium.',
            'browser_assist_available': False,
            'scan_report': [{'stage':'Deep browser','status':'checked','detail':'Playwright is not installed on this Nexora server.'}],
        }

    report = []
    products = []
    candidate_links = []
    challenge_type = None
    challenge_message = None

    try:
        with sync_playwright() as pw:
            try:
                chromium = pw.chromium.launch(channel='chrome', headless=True)
            except Exception:
                chromium = pw.chromium.launch(headless=True)
            context = chromium.new_context(viewport={'width': 1440, 'height': 1000})
            browser._install_sync_route(context)
            page = context.new_page()
            browser._goto_sync(page, raw_url if str(raw_url).startswith(('http://','https://')) else 'https://' + str(raw_url))

            for listing_index in range(MAX_LISTING_PAGES):
                page_products, links, ctype, cmessage = browser._extract_sync_page(page)
                products.extend(page_products)
                scrolled, scrolled_links = _scroll_collect(page)
                products.extend(scrolled)
                candidate_links.extend(scrolled_links)
                for x in links or []:
                    if isinstance(x, dict) and x.get('href'):
                        candidate_links.append(x['href'])
                if ctype:
                    challenge_type, challenge_message = ctype, cmessage
                    break

                try:
                    next_action = page.evaluate(NEXT_SCRIPT)
                except Exception:
                    next_action = None
                if not next_action:
                    break
                current = page.url
                try:
                    if next_action.get('type') == 'href' and next_action.get('value'):
                        target = next_action['value']
                        if not universal._same_site(origin, target):
                            break
                        browser._goto_sync(page, target)
                    else:
                        page.get_by_role('button', name=re.compile('next|more', re.I)).first.click(timeout=2500)
                        page.wait_for_timeout(900)
                    if page.url == current and next_action.get('type') == 'href':
                        break
                except Exception:
                    break

            try:
                candidate_links.extend(universal._sitemap_pages(origin))
            except Exception:
                pass

            unique_links = []
            for link in candidate_links:
                if not link or not universal._same_site(origin, link):
                    continue
                clean = _clean_url(link)
                if clean not in unique_links:
                    unique_links.append(clean)

            checked = 0
            for link in unique_links[:MAX_PRODUCT_PAGES]:
                try:
                    browser._goto_sync(page, link)
                    found, _, ctype, cmessage = browser._extract_sync_page(page)
                    products.extend(found)
                    checked += 1
                    if ctype:
                        challenge_type, challenge_message = ctype, cmessage
                        break
                except Exception:
                    continue

            products = universal._dedupe(products)
            report.append({
                'stage':'Deep rendered catalogue',
                'status':'ok' if products else 'checked',
                'detail':f'Rendered listing/infinite-scroll pages and {checked} product page(s); extracted {len(products)} unique product candidate(s).',
                'count':len(products),
            })
            chromium.close()
    except Exception as exc:
        return {
            'website_url': raw_url,
            'platform':'browser-unavailable',
            'products':[],
            'manual_required':True,
            'challenge_type':'browser_setup',
            'manual_message':'Nexora could not start Chrome/Chromium for the deep scan. Install Playwright Chromium or Chrome.',
            'browser_assist_available':False,
            'browser_error':exc.__class__.__name__,
            'scan_report':[{'stage':'Deep browser','status':'checked','detail':f'Browser scan failed ({exc.__class__.__name__}).'}],
        }

    if challenge_type:
        return {
            'website_url': raw_url,
            'platform':'browser-assisted',
            'products':products,
            'manual_required':True,
            'challenge_type':challenge_type,
            'manual_message':challenge_message,
            'browser_assist_available':True,
            'scan_report':report,
        }
    return {
        'website_url': raw_url,
        'platform':'browser-rendered',
        'products':products,
        'manual_required':not bool(products),
        'challenge_type':None if products else 'navigation',
        'manual_message':None if products else 'Open the assisted browser and navigate to the product catalogue, then continue the scan.',
        'browser_assist_available':True,
        'scan_report':report,
    }


def deep_scan_sync(raw_url):
    fast = None
    fast_error = None
    try:
        fast = universal.scan_store_sync(raw_url)
    except HTTPException as exc:
        fast_error = exc.detail
    except Exception as exc:
        fast_error = exc.__class__.__name__

    rendered = deep_browser_scan_sync(raw_url)
    fast_products = (fast or {}).get('products') or []
    rendered_products = rendered.get('products') or []
    merged = universal._dedupe(fast_products + rendered_products)
    report = ((fast or {}).get('scan_report') or []) + (rendered.get('scan_report') or [])
    if fast_error:
        report.insert(0, {'stage':'Fast public scan','status':'checked','detail':f'Fast scan could not complete: {fast_error}. Browser scan continued.'})

    platform = rendered.get('platform') if rendered_products else (fast or {}).get('platform') or rendered.get('platform')
    return {
        **(fast or {}),
        **rendered,
        'website_url': (fast or {}).get('website_url') or rendered.get('website_url') or raw_url,
        'platform': platform,
        'products': merged,
        'count': len(merged),
        'scan_report': report,
        'manual_required': bool(rendered.get('manual_required') and not merged),
    }
