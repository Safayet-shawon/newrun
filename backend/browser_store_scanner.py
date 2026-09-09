"""Browser-rendered fallback for Nexora PRO store import.

The fast scanner remains first. When a public store is JavaScript-rendered or
needs a seller to complete login/CAPTCHA, this module can open Chromium,
extract the rendered catalogue, and hand normalized products back to the
existing Nexora import flow.

Manual sessions are intentionally ephemeral: credentials/cookies stay only in
the temporary browser context and are discarded when the session closes.
"""
import asyncio
import re
import socket
import ipaddress
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, urlunparse

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db, new_id, now_iso
from security import require_role
import store_importer
import universal_store_scanner as universal

router = APIRouter()
seller_dep = require_role("seller")

MAX_BROWSER_PAGES = 40
MANUAL_TTL_MINUTES = 15
_manual_sessions = {}

PRODUCT_DOM_SCRIPT = r"""
() => {
  const pick = (selectors) => {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const value =
          el.getAttribute("content") ||
          el.getAttribute("data-price") ||
          el.getAttribute("value") ||
          el.textContent;
        if (value && String(value).trim()) return String(value).trim();
      }
    }
    return "";
  };

  const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
  const path = location.pathname.toLowerCase();
  const strongSignal =
    /\/(product|products|item|items|p)\//i.test(path) ||
    /add\s*to\s*(cart|bag)|buy\s*now|order\s*now|out\s*of\s*stock|in\s*stock/i.test(bodyText) ||
    !!document.querySelector('[itemtype*="schema.org/Product"], [data-product-id], [data-product]');

  const title = pick([
    '[itemprop="name"]',
    '[data-testid*="product-title" i]',
    '[class*="product-title" i]',
    '[class*="productTitle"]',
    'main h1',
    'h1',
    'meta[property="og:title"]',
  ]);

  const priceNodes = Array.from(document.querySelectorAll(
    '[itemprop="price"], meta[property="product:price:amount"], meta[property="og:price:amount"], [data-price], [data-testid*="price" i], [class*="price" i]'
  )).slice(0, 12);
  const prices = priceNodes
    .map((el) => el.getAttribute("content") || el.getAttribute("data-price") || el.textContent || "")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const images = [];
  const metaImage = pick(['meta[property="og:image"]', 'meta[name="twitter:image"]']);
  if (metaImage) images.push(metaImage);
  for (const img of Array.from(document.querySelectorAll(
    'main img, [class*="product" i] img, [class*="gallery" i] img, [data-product] img'
  )).slice(0, 16)) {
    const src = img.currentSrc || img.src || img.getAttribute("data-src") || "";
    if (src && !images.includes(src)) images.push(src);
  }

  const description = pick([
    '[itemprop="description"]',
    '[data-testid*="description" i]',
    '[class*="product-description" i]',
    '[class*="description" i]',
    'meta[property="og:description"]',
    'meta[name="description"]',
  ]);

  const category = pick([
    '[itemprop="category"]',
    '[class*="breadcrumb" i] li:last-child',
    '[aria-label*="breadcrumb" i] li:last-child',
  ]);

  const brand = pick([
    '[itemprop="brand"]',
    '[data-testid*="brand" i]',
    '[class*="brand" i]',
    'meta[property="product:brand"]',
  ]);

  const skuEl = document.querySelector('[itemprop="sku"], [data-sku]');
  let sku = skuEl
    ? (skuEl.getAttribute("content") || skuEl.getAttribute("data-sku") || skuEl.textContent || "").trim()
    : "";
  if (!sku) {
    const match = bodyText.match(/\bSKU\s*[:#-]?\s*([A-Z0-9._-]{2,80})/i);
    if (match) sku = match[1];
  }

  const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href;

  return {
    strongSignal,
    url: canonical,
    title,
    prices,
    images,
    description,
    category,
    brand,
    sku,
    text: bodyText.slice(0, 25000),
  };
}
"""

LINKS_SCRIPT = r"""
() => Array.from(document.querySelectorAll('a[href]')).map((a) => {
  const href = a.href;
  const card = a.closest(
    '[data-product-id], [data-product], article, [class*="product" i], [class*="card" i], li'
  );
  return {
    href,
    productish:
      /\/(product|products|item|items|p)(\/|\?|$)/i.test(href) ||
      !!a.closest('[data-product-id], [data-product], [class*="product" i]'),
    listing:
      /\/(shop|store|catalog|collection|collections|category|categories)(\/|\?|$)/i.test(href),
    text: (card?.innerText || a.innerText || "").slice(0, 400),
  };
}).filter((x) => x.href)
"""


def _challenge_from(url, html_text, body_text):
    joined = f"{url}\n{html_text[:120000]}\n{body_text[:30000]}".lower()
    captcha_markers = (
        "g-recaptcha", "hcaptcha", "cf-turnstile", "turnstile", "verify you are human",
        "checking your browser", "challenge-platform", "captcha",
    )
    if any(marker in joined for marker in captcha_markers):
        return "captcha", "This store needs CAPTCHA or human verification before Nexora can continue."

    path = (urlparse(url).path or "").lower()
    login_path = any(x in path for x in ("/login", "/signin", "/sign-in", "/account/login", "/auth"))
    password_form = "type=\"password\"" in joined or "type='password'" in joined
    if login_path or password_form:
        return "login", "This store requires login. Sign in to the store in the opened browser, then continue the scan."

    return None, None


def _public_url_allowed(url, cache):
    p = urlparse(url)
    if p.scheme in ("data", "blob"):
        return True
    if p.scheme not in ("http", "https") or not p.hostname:
        return False
    port = p.port or (443 if p.scheme == "https" else 80)
    key = (p.hostname.lower(), port)
    if key in cache:
        return cache[key]
    try:
        infos = socket.getaddrinfo(p.hostname, port, type=socket.SOCK_STREAM)
        allowed = bool(infos) and all(ipaddress.ip_address(info[4][0]).is_global for info in infos)
    except Exception:
        allowed = False
    cache[key] = allowed
    return allowed


def _same_site_links(raw_links, origin):
    out = []
    for item in raw_links or []:
        target = item.get("href") if isinstance(item, dict) else None
        if not target:
            continue
        try:
            p = urlparse(target)
        except Exception:
            continue
        if p.scheme not in ("http", "https") or not universal._same_site(origin, target):
            continue
        clean = urlunparse((p.scheme, p.netloc, p.path, "", p.query, ""))
        if clean not in out:
            out.append(clean)
    return out


def _dom_to_product(raw, platform="browser"):
    if not raw or not raw.get("strongSignal") or not raw.get("title"):
        return None

    nums = []
    for value in raw.get("prices") or []:
        n = universal._number(value)
        if n is not None and 0 < n < 1_000_000_000:
            nums.append(n)
    if not nums:
        return None

    regular = max(nums)
    current = min(nums)
    discount = current if current < regular else None

    text = raw.get("text") or ""
    stock_known = False
    stock = 0
    if re.search(r"\bout\s*of\s*stock\b|\bsold\s*out\b", text, re.I):
        stock_known = True
        stock = 0
    elif re.search(r"\bin\s*stock\b|\bavailable\b", text, re.I):
        stock_known = True
        stock = 1

    source_url = raw.get("url") or ""
    return universal._product(
        platform,
        raw.get("sku") or source_url,
        source_url,
        raw.get("title"),
        regular,
        discount_price=discount,
        description=raw.get("description") or "",
        images=raw.get("images") or [],
        sku=raw.get("sku") or "",
        stock=stock,
        stock_known=stock_known,
        category=raw.get("category") or "",
        brand=raw.get("brand") or "",
    )


def _launch_sync(playwright, headless=True):
    try:
        return playwright.chromium.launch(channel="chrome", headless=headless)
    except Exception:
        return playwright.chromium.launch(headless=headless)


def _install_sync_route(context):
    cache = {}

    def handler(route, request):
        if _public_url_allowed(request.url, cache):
            route.continue_()
        else:
            route.abort()

    context.route("**/*", handler)


def _goto_sync(page, url):
    universal._assert_public(url)
    page.goto(url, wait_until="domcontentloaded", timeout=20000)
    try:
        page.wait_for_load_state("networkidle", timeout=5000)
    except Exception:
        pass
    page.wait_for_timeout(900)


def _extract_sync_page(page):
    html_text = page.content()
    body_text = ""
    try:
        body_text = page.locator("body").inner_text(timeout=2500)
    except Exception:
        pass
    challenge_type, challenge_message = _challenge_from(page.url, html_text, body_text)

    products = []
    try:
        products.extend(universal._scan_html(html_text, page.url))
    except Exception:
        pass
    try:
        item = _dom_to_product(page.evaluate(PRODUCT_DOM_SCRIPT))
        if item:
            products.append(item)
    except Exception:
        pass
    try:
        links = page.evaluate(LINKS_SCRIPT)
    except Exception:
        links = []

    return universal._dedupe(products), links, challenge_type, challenge_message


def browser_scan_sync(raw_url):
    origin = universal._origin(raw_url)
    universal._assert_public(origin)

    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return {
            "website_url": origin,
            "platform": "browser-unavailable",
            "products": [],
            "manual_required": True,
            "challenge_type": "browser_setup",
            "manual_message": "Browser scanning is not installed on this Nexora server yet.",
            "browser_assist_available": False,
            "scan_report": [{
                "stage": "Rendered browser",
                "status": "checked",
                "detail": "Playwright is not installed. Install backend requirements and Chromium/Chrome support.",
            }],
        }

    report = []
    try:
        with sync_playwright() as pw:
            browser = _launch_sync(pw, headless=True)
            context = browser.new_context()
            _install_sync_route(context)
            page = context.new_page()

            _goto_sync(page, origin)
            products, links, challenge_type, challenge_message = _extract_sync_page(page)
            report.append({
                "stage": "Rendered browser",
                "status": "ok" if products else "checked",
                "detail": f"Rendered the JavaScript homepage; found {len(products)} product(s) immediately.",
                "count": len(products),
            })

            if challenge_type:
                browser.close()
                return {
                    "website_url": origin,
                    "platform": "browser",
                    "products": products,
                    "manual_required": True,
                    "challenge_type": challenge_type,
                    "manual_message": challenge_message,
                    "browser_assist_available": True,
                    "scan_report": report,
                }

            product_links = [
                x.get("href") for x in links
                if isinstance(x, dict) and x.get("productish") and x.get("href")
            ]
            listing_links = [
                x.get("href") for x in links
                if isinstance(x, dict) and x.get("listing") and x.get("href")
            ]

            for listing in _same_site_links(
                [{"href": u} for u in listing_links], origin
            )[:6]:
                try:
                    _goto_sync(page, listing)
                    listing_products, listing_page_links, ctype, cmessage = _extract_sync_page(page)
                    products.extend(listing_products)
                    if ctype:
                        challenge_type, challenge_message = ctype, cmessage
                        break
                    for x in listing_page_links:
                        if isinstance(x, dict) and x.get("productish") and x.get("href"):
                            product_links.append(x["href"])
                except Exception:
                    continue

            try:
                sitemap_links = universal._sitemap_pages(origin)
            except Exception:
                sitemap_links = []

            candidates = []
            for url in product_links + sitemap_links:
                if not url or not universal._same_site(origin, url):
                    continue
                p = urlparse(url)
                clean = urlunparse((p.scheme, p.netloc, p.path, "", p.query, ""))
                if clean not in candidates:
                    candidates.append(clean)

            pages_checked = 0
            for candidate in candidates[:MAX_BROWSER_PAGES]:
                try:
                    _goto_sync(page, candidate)
                    page_products, _, ctype, cmessage = _extract_sync_page(page)
                    pages_checked += 1
                    products.extend(page_products)
                    if ctype:
                        challenge_type, challenge_message = ctype, cmessage
                        break
                except Exception:
                    continue

            products = universal._dedupe(products)
            report.append({
                "stage": "Rendered product pages",
                "status": "ok" if products else "checked",
                "detail": f"Rendered {pages_checked} candidate page(s); {len(products)} unique product(s) extracted.",
                "count": len(products),
            })
            browser.close()

            manual_required = bool(challenge_type or not products)
            if not challenge_message and not products:
                challenge_type = "navigation"
                challenge_message = (
                    "Nexora rendered the store but still could not identify products automatically. "
                    "Open the assisted browser, navigate until the product catalogue is visible, then continue."
                )

            return {
                "website_url": origin,
                "platform": "browser-rendered" if products else "browser",
                "products": products,
                "manual_required": manual_required,
                "challenge_type": challenge_type,
                "manual_message": challenge_message,
                "browser_assist_available": True,
                "scan_report": report,
            }
    except Exception as exc:
        return {
            "website_url": origin,
            "platform": "browser-unavailable",
            "products": [],
            "manual_required": True,
            "challenge_type": "browser_setup",
            "manual_message": (
                "Nexora could not start its rendered browser. Install Playwright browser support, "
                "or use a server with Chrome/Chromium available."
            ),
            "browser_assist_available": False,
            "browser_error": exc.__class__.__name__,
            "scan_report": [{
                "stage": "Rendered browser",
                "status": "checked",
                "detail": f"Browser fallback could not start ({exc.__class__.__name__}).",
            }],
        }


def composite_scan_sync(raw_url):
    fast = universal.scan_store_sync(raw_url)
    fast["browser_assist_available"] = True
    if fast.get("products"):
        return fast

    rendered = browser_scan_sync(raw_url)
    merged_report = (fast.get("scan_report") or []) + (rendered.get("scan_report") or [])
    return {
        **fast,
        **rendered,
        "website_url": fast.get("website_url") or rendered.get("website_url"),
        "scan_report": merged_report,
    }


async def _persist_scan_result(user_id, result):
    scan_id = new_id("scan_")
    await db.store_import_scans.insert_one({
        "id": scan_id,
        "seller_id": user_id,
        **result,
        "created_at": now_iso(),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=store_importer.SCAN_TTL_MINUTES),
    })

    unknown = sum(1 for p in result.get("products", []) if not p.get("stock_known"))
    warnings = []
    if unknown:
        warnings.append(
            f"{unknown} product(s) did not expose exact stock; they will import with stock 0 until reviewed."
        )
    if not result.get("products"):
        if result.get("challenge_type") == "captcha":
            warnings.append("CAPTCHA/human verification must be completed manually before product extraction can continue.")
        elif result.get("challenge_type") == "login":
            warnings.append("This store requires login. Sign in manually in the assisted browser, then continue.")
        elif result.get("challenge_type") == "browser_setup":
            warnings.append("Rendered browser support is not ready on this server.")
        else:
            warnings.append(
                "No products were extracted automatically. Use the assisted browser and navigate to a visible product catalogue."
            )

    return {
        "scan_id": scan_id,
        **result,
        "count": len(result.get("products", [])),
        "warnings": warnings,
    }


class ScanBody(BaseModel):
    url: str = Field(min_length=4, max_length=500)
    confirm_rights: bool = False


@router.post("/seller/import-store/scan")
async def enhanced_scan(body: ScanBody, user: dict = Depends(seller_dep)):
    await store_importer._require_import(user)
    if not body.confirm_rights:
        raise HTTPException(
            422,
            "Confirm that you own this website or have permission to import its catalogue",
        )
    result = await asyncio.to_thread(composite_scan_sync, body.url)
    return await _persist_scan_result(user["id"], result)


async def _close_session(session_id):
    session = _manual_sessions.pop(session_id, None)
    if not session:
        return
    try:
        await session["context"].close()
    except Exception:
        pass
    try:
        await session["browser"].close()
    except Exception:
        pass
    try:
        await session["playwright"].stop()
    except Exception:
        pass


async def _cleanup_sessions():
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=MANUAL_TTL_MINUTES)
    stale = [
        session_id
        for session_id, session in _manual_sessions.items()
        if session["created_at"] < cutoff
    ]
    for session_id in stale:
        await _close_session(session_id)


async def _install_async_route(context):
    cache = {}

    async def handler(route, request):
        allowed = await asyncio.to_thread(_public_url_allowed, request.url, cache)
        if allowed:
            await route.continue_()
        else:
            await route.abort()

    await context.route("**/*", handler)


async def _goto_async(page, url):
    universal._assert_public(url)
    await page.goto(url, wait_until="domcontentloaded", timeout=25000)
    try:
        await page.wait_for_load_state("networkidle", timeout=6000)
    except Exception:
        pass
    await page.wait_for_timeout(1000)


async def _extract_async_page(page):
    html_text = await page.content()
    try:
        body_text = await page.locator("body").inner_text(timeout=2500)
    except Exception:
        body_text = ""
    challenge_type, challenge_message = _challenge_from(page.url, html_text, body_text)

    products = []
    try:
        products.extend(universal._scan_html(html_text, page.url))
    except Exception:
        pass
    try:
        item = _dom_to_product(await page.evaluate(PRODUCT_DOM_SCRIPT))
        if item:
            products.append(item)
    except Exception:
        pass
    try:
        links = await page.evaluate(LINKS_SCRIPT)
    except Exception:
        links = []
    return universal._dedupe(products), links, challenge_type, challenge_message


async def _crawl_manual_session(session):
    page = session["page"]
    origin = session["origin"]

    products, links, challenge_type, challenge_message = await _extract_async_page(page)
    if challenge_type:
        return [], [], challenge_type, challenge_message

    product_links = [
        x.get("href") for x in links
        if isinstance(x, dict) and x.get("productish") and x.get("href")
    ]
    listing_links = [
        x.get("href") for x in links
        if isinstance(x, dict) and x.get("listing") and x.get("href")
    ]

    for listing in _same_site_links(
        [{"href": u} for u in listing_links], origin
    )[:8]:
        try:
            await _goto_async(page, listing)
            found, found_links, ctype, cmessage = await _extract_async_page(page)
            products.extend(found)
            if ctype:
                return universal._dedupe(products), [], ctype, cmessage
            for x in found_links:
                if isinstance(x, dict) and x.get("productish") and x.get("href"):
                    product_links.append(x["href"])
        except Exception:
            continue

    try:
        sitemap_links = await asyncio.to_thread(universal._sitemap_pages, origin)
    except Exception:
        sitemap_links = []

    candidates = []
    for url in product_links + sitemap_links:
        if not url or not universal._same_site(origin, url):
            continue
        p = urlparse(url)
        clean = urlunparse((p.scheme, p.netloc, p.path, "", p.query, ""))
        if clean not in candidates:
            candidates.append(clean)

    for candidate in candidates[:MAX_BROWSER_PAGES]:
        try:
            await _goto_async(page, candidate)
            found, _, ctype, cmessage = await _extract_async_page(page)
            products.extend(found)
            if ctype:
                return universal._dedupe(products), candidates, ctype, cmessage
        except Exception:
            continue

    return universal._dedupe(products), candidates[:MAX_BROWSER_PAGES], None, None


class ManualStartBody(BaseModel):
    url: str = Field(min_length=4, max_length=500)
    confirm_rights: bool = False


@router.post("/seller/import-store/manual/start")
async def start_manual_browser(body: ManualStartBody, user: dict = Depends(seller_dep)):
    await store_importer._require_import(user)
    if not body.confirm_rights:
        raise HTTPException(422, "Confirm ownership/permission before browser-assisted import")

    await _cleanup_sessions()
    origin = universal._origin(body.url)
    universal._assert_public(origin)

    for session_id, session in list(_manual_sessions.items()):
        if session["seller_id"] == user["id"]:
            await _close_session(session_id)

    try:
        from playwright.async_api import async_playwright
    except Exception:
        raise HTTPException(
            503,
            "Browser assistance is not installed. Run: py -m pip install -r requirements.txt",
        )

    pw = await async_playwright().start()
    try:
        try:
            browser = await pw.chromium.launch(channel="chrome", headless=False)
        except Exception:
            browser = await pw.chromium.launch(headless=False)
        context = await browser.new_context()
        await _install_async_route(context)
        page = await context.new_page()
        await _goto_async(page, origin)
    except Exception as exc:
        try:
            await pw.stop()
        except Exception:
            pass
        raise HTTPException(
            503,
            "Could not open the assisted browser. Install Chrome/Chromium or run `py -m playwright install chromium`.",
        ) from exc

    session_id = new_id("browser_")
    _manual_sessions[session_id] = {
        "seller_id": user["id"],
        "origin": origin,
        "playwright": pw,
        "browser": browser,
        "context": context,
        "page": page,
        "created_at": datetime.now(timezone.utc),
    }

    try:
        html_text = await page.content()
        body_text = await page.locator("body").inner_text(timeout=2500)
    except Exception:
        html_text, body_text = "", ""
    challenge_type, challenge_message = _challenge_from(page.url, html_text, body_text)

    return {
        "session_id": session_id,
        "status": "waiting_for_user",
        "challenge_type": challenge_type or "navigation",
        "message": challenge_message or (
            "Browser opened. If needed, log in or solve CAPTCHA there. Navigate until products are visible, "
            "then return to Nexora and click Continue scan."
        ),
        "expires_in_minutes": MANUAL_TTL_MINUTES,
        "privacy_note": "Credentials stay inside the temporary store browser; Nexora does not ask you to type them into the import form.",
    }


@router.post("/seller/import-store/manual/{session_id}/continue")
async def continue_manual_browser(session_id: str, user: dict = Depends(seller_dep)):
    await store_importer._require_import(user)
    await _cleanup_sessions()
    session = _manual_sessions.get(session_id)
    if not session or session["seller_id"] != user["id"]:
        raise HTTPException(404, "Browser session expired or was not found")

    products, candidates, challenge_type, challenge_message = await _crawl_manual_session(session)

    if challenge_type:
        return {
            "session_id": session_id,
            "status": "waiting_for_user",
            "manual_required": True,
            "challenge_type": challenge_type,
            "message": challenge_message,
            "count": 0,
            "products": [],
        }

    if not products:
        return {
            "session_id": session_id,
            "status": "waiting_for_user",
            "manual_required": True,
            "challenge_type": "navigation",
            "message": (
                "No products are visible to Nexora yet. In the opened browser, navigate to the store's "
                "shop/product listing or open a product page, then click Continue scan again."
            ),
            "count": 0,
            "products": [],
        }

    result = {
        "website_url": session["origin"],
        "platform": "browser-assisted",
        "products": products,
        "manual_required": False,
        "challenge_type": None,
        "manual_message": None,
        "browser_assist_available": True,
        "scan_report": [
            {
                "stage": "Manual verification",
                "status": "ok",
                "detail": "Seller completed any required login/CAPTCHA/navigation in the temporary browser.",
            },
            {
                "stage": "Browser extraction",
                "status": "ok",
                "detail": f"Extracted {len(products)} product(s) from rendered pages after manual access.",
                "count": len(products),
            },
        ],
    }
    response = await _persist_scan_result(user["id"], result)
    await _close_session(session_id)
    return response


@router.post("/seller/import-store/manual/{session_id}/cancel")
async def cancel_manual_browser(session_id: str, user: dict = Depends(seller_dep)):
    session = _manual_sessions.get(session_id)
    if session and session["seller_id"] != user["id"]:
        raise HTTPException(404, "Browser session was not found")
    await _close_session(session_id)
    return {"ok": True}


async def close_all_manual_sessions():
    for session_id in list(_manual_sessions):
        await _close_session(session_id)
