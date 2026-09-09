"""Improved Facebook Page catalogue import.

The seller completes Facebook login/verification in the temporary browser.
Nexora then scrolls the visible Page feed, accumulates virtualized posts, keeps
price-bearing product posts with images, and passes them to the normal AI
catalogue review. No login/CAPTCHA bypass is attempted.
"""
import re
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from security import require_role
import browser_store_scanner as browser
import social_store_scanner as legacy
import store_importer
import universal_store_scanner as universal

router = APIRouter()
seller_dep = require_role("seller")

BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
PRICE_PATTERNS = [
    re.compile(r"(?:৳|bdt|tk\.?|taka)\s*[:=\-]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)", re.I),
    re.compile(r"([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:৳|bdt|tk\.?|taka)", re.I),
    re.compile(r"\b(?:price|offer price|sale price|only)\s*[:=\-]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b", re.I),
]

POSTS_SCRIPT = r"""
() => {
  const articles = Array.from(document.querySelectorAll('[role="article"], article')).slice(0, 350);
  return articles.map((article, index) => {
    const text = (article.innerText || '').replace(/\s+/g, ' ').trim();
    const images = Array.from(article.querySelectorAll('img'))
      .map((img) => img.currentSrc || img.src || img.getAttribute('data-src') || '')
      .filter((src) => src && !/emoji|profile|avatar|static\.xx\.fbcdn/i.test(src))
      .slice(0, 12);
    const links = Array.from(article.querySelectorAll('a[href]')).map((a) => a.href);
    const permalink = links.find((href) =>
      /\/posts\/|\/photos\/|\/reel\/|story_fbid=|permalink|posts\/pfbid/i.test(href)
    ) || '';
    return { index, text, images, permalink, pageUrl: location.href };
  }).filter((x) => x.text && x.text.length > 4);
}
"""


class SocialStartBody(BaseModel):
    url: str = Field(min_length=4, max_length=500)
    confirm_rights: bool = False


@router.post("/seller/import-store/manual/start")
@router.post("/seller/import-store/social/manual/start")
async def start_assisted(body: SocialStartBody, user: dict = Depends(seller_dep)):
    legacy_body = legacy.SocialStartBody(url=body.url, confirm_rights=body.confirm_rights)
    return await legacy.start_assisted(legacy_body, user)


def _price(text):
    normalized = str(text or "").translate(BN_DIGITS)
    for pattern in PRICE_PATTERNS:
        match = pattern.search(normalized)
        if match:
            value = universal._number(match.group(1))
            if value and value > 0:
                return value
    return None


def _title(text):
    normalized = re.sub(r"\s+", " ", str(text or "")).strip()
    if not normalized:
        return ""
    candidates = re.split(r"(?:\n|[|•]|(?:\s{2,}))", str(text or ""))
    for candidate in candidates:
        clean = re.sub(r"\s+", " ", candidate).strip(" -|•:–—")
        if 4 <= len(clean) <= 150 and not any(p.search(clean.translate(BN_DIGITS)) for p in PRICE_PATTERNS):
            return clean
    return " ".join(normalized.split()[:16])[:150]


def _post_identity(post):
    if post.get("permalink"):
        return post["permalink"]
    return re.sub(r"\s+", " ", post.get("text") or "").strip().lower()[:260]


def _post_product(post):
    text = post.get("text") or ""
    price = _price(text)
    images = [x for x in (post.get("images") or []) if x]
    if not price or not images or len(text.strip()) < 8:
        return None
    title = _title(text)
    if not title:
        return None
    permalink = post.get("permalink") or post.get("pageUrl") or ""
    item = universal._product("facebook", permalink or _post_identity(post), permalink, title, price, description=text, images=images, stock=0, stock_known=False, category="", brand="")
    if item:
        item["social_signal"] = "price+image"
    return item


async def _click_see_more(page):
    try:
        await page.evaluate(r"""
            () => {
              const labels = ['see more', 'আরও দেখুন', 'more'];
              const nodes = Array.from(document.querySelectorAll('[role="button"], button'));
              let clicked = 0;
              for (const node of nodes) {
                const text = (node.innerText || node.getAttribute('aria-label') || '').trim().toLowerCase();
                if (labels.some((label) => text === label || text.includes(label))) {
                  try { node.click(); clicked++; } catch {}
                  if (clicked >= 8) break;
                }
              }
              return clicked;
            }
        """)
    except Exception:
        pass


async def _facebook_posts_deep(page):
    collected = {}
    stagnant, last_count = 0, 0
    for index in range(60):
        await _click_see_more(page)
        try:
            batch = await page.evaluate(POSTS_SCRIPT)
        except Exception:
            batch = []
        for post in batch or []:
            identity = _post_identity(post)
            if identity and identity not in collected:
                collected[identity] = post
            elif identity:
                old = collected[identity]
                old_score = len(old.get("text") or "") + len(old.get("images") or []) * 200
                new_score = len(post.get("text") or "") + len(post.get("images") or []) * 200
                if new_score > old_score:
                    collected[identity] = post
        if len(collected) == last_count:
            stagnant += 1
        else:
            stagnant, last_count = 0, len(collected)
        if len(collected) >= 500 or stagnant >= 9:
            break
        try:
            await page.mouse.wheel(0, 2200 if index < 20 else 3200)
            await page.wait_for_timeout(650)
        except Exception:
            break
    return list(collected.values())


@router.post("/seller/import-store/social/manual/{session_id}/continue")
async def continue_social(session_id: str, user: dict = Depends(seller_dep)):
    await store_importer._require_import(user)
    await browser._cleanup_sessions()
    session = browser._manual_sessions.get(session_id)
    if not session or session.get("seller_id") != user["id"]:
        raise HTTPException(404, "Browser session expired or was not found")

    page = session["page"]
    current_host = (urlparse(page.url).hostname or "").lower()
    original_host = (urlparse(session.get("source_url") or session.get("origin") or "").hostname or "").lower()
    if "facebook.com" not in current_host and "facebook.com" not in original_host:
        raise HTTPException(422, "This assisted session is not a Facebook Page session")

    try:
        html_text = await page.content()
        body_text = await page.locator("body").inner_text(timeout=3000)
    except Exception:
        html_text, body_text = "", ""
    challenge_type, challenge_message = browser._challenge_from(page.url, html_text, body_text)
    if challenge_type:
        return {"session_id": session_id, "status": "waiting_for_user", "manual_required": True, "challenge_type": challenge_type, "message": challenge_message, "count": 0, "products": []}

    posts = await _facebook_posts_deep(page)
    products = []
    for post in posts:
        product = _post_product(post)
        if product:
            products.append(product)
    products = universal._dedupe(products)

    if not products:
        return {
            "session_id": session_id,
            "status": "waiting_for_user",
            "manual_required": True,
            "challenge_type": "facebook_navigation",
            "message": "Nexora can access Facebook, but no visible post with both a product image and a readable price was found. In the opened browser, open the correct Page's Posts/Photos area, scroll until product posts are visible, then click Continue scan again.",
            "count": 0,
            "products": [],
            "social_stats": {"posts_reviewed": len(posts), "product_candidates": 0, "ignored_without_visible_price_or_image": len(posts)},
        }

    result = {
        "website_url": session.get("source_url") or session.get("origin"),
        "platform": "facebook-page",
        "products": products,
        "manual_required": False,
        "challenge_type": None,
        "manual_message": None,
        "browser_assist_available": True,
        "social_stats": {"posts_reviewed": len(posts), "product_candidates": len(products), "ignored_without_visible_price_or_image": max(0, len(posts) - len(products))},
        "scan_report": [
            {"stage": "Facebook access", "status": "ok", "detail": "Seller completed any required Facebook login/verification in the temporary browser."},
            {"stage": "Deep Page scroll", "status": "ok", "detail": f"Accumulated {len(posts)} visible Page post(s) across the scrolling session.", "count": len(posts)},
            {"stage": "Product post analysis", "status": "ok", "detail": f"Kept {len(products)} post(s) with a readable price and product image. Other visible posts stay on Facebook and are simply excluded from the import list.", "count": len(products)},
        ],
    }
    response = await browser._persist_scan_result(user["id"], result)
    await browser._close_session(session_id)
    return response
