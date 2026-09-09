"""Browser-assisted social catalogue import for seller-owned Facebook pages.

Facebook often requires login/verification and renders posts dynamically, so
Nexora only reads what the seller can see in the temporary assisted browser.
It never asks for Facebook credentials and never bypasses login/CAPTCHA.
"""
import re
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException

from security import require_role
import browser_store_scanner as browser
import store_importer
import universal_store_scanner as universal

router = APIRouter()
seller_dep = require_role("seller")

POSTS_SCRIPT = r"""
() => {
  const articles = Array.from(document.querySelectorAll('[role="article"], article')).slice(0, 250);
  return articles.map((article, index) => {
    const text = (article.innerText || '').replace(/\s+/g, ' ').trim();
    const images = Array.from(article.querySelectorAll('img'))
      .map((img) => img.currentSrc || img.src || '')
      .filter((src) => src && !/emoji|profile|avatar/i.test(src))
      .slice(0, 10);
    const links = Array.from(article.querySelectorAll('a[href]')).map((a) => a.href);
    const permalink = links.find((href) => /\/posts\/|\/photos\/|\/reel\/|story_fbid=|permalink/i.test(href)) || location.href;
    return { index, text, images, permalink };
  }).filter((x) => x.text);
}
"""

PRICE_PATTERNS = [
    re.compile(r"(?:৳|BDT|Tk\.?|TK\.?|Taka)\s*[:=-]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)", re.I),
    re.compile(r"([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:৳|BDT|Tk\.?|TK\.?|Taka)", re.I),
]
PRODUCT_SIGNAL = re.compile(
    r"\b(?:price|size|sizes|color|colour|stock|available|order|delivery|collection|product|pcs?|piece|set|fabric|material|weight|ml|kg|gram|inbox)\b",
    re.I,
)


def _price(text):
    for pattern in PRICE_PATTERNS:
        match = pattern.search(text or "")
        if match:
            return universal._number(match.group(1))
    return None


def _title(text):
    raw = re.sub(r"\s+", " ", text or "").strip()
    if not raw:
        return ""
    chunks = [x.strip(" -|•:–—") for x in re.split(r"[\n|•]", text or "") if x.strip()]
    for chunk in chunks:
        if 3 <= len(chunk) <= 140 and not PRICE_PATTERNS[0].search(chunk):
            return chunk
    words = raw.split()
    return " ".join(words[:14])[:140]


def _post_product(post):
    text = post.get("text") or ""
    price = _price(text)
    if not price or price <= 0:
        return None
    images = post.get("images") or []
    if not images:
        return None
    # Price + image are strong signals; product-language increases confidence.
    if len(text) < 8:
        return None
    title = _title(text)
    if not title:
        return None
    permalink = post.get("permalink") or ""
    item = universal._product(
        "facebook",
        permalink or f"fb-post-{post.get('index')}",
        permalink,
        title,
        price,
        description=text,
        images=images,
        stock=0,
        stock_known=False,
        category="",
        brand="",
    )
    if item:
        item["social_signal"] = "strong" if PRODUCT_SIGNAL.search(text) else "price+image"
    return item


async def _facebook_posts(page):
    # Load more posts without trying to evade any platform controls.
    for _ in range(8):
        try:
            await page.mouse.wheel(0, 1800)
            await page.wait_for_timeout(900)
        except Exception:
            break
    try:
        return await page.evaluate(POSTS_SCRIPT)
    except Exception:
        return []


@router.post("/seller/import-store/social/manual/{session_id}/continue")
async def continue_social(session_id: str, user: dict = Depends(seller_dep)):
    await store_importer._require_import(user)
    await browser._cleanup_sessions()
    session = browser._manual_sessions.get(session_id)
    if not session or session.get("seller_id") != user["id"]:
        raise HTTPException(404, "Browser session expired or was not found")

    host = (urlparse(session.get("page").url).hostname or "").lower()
    origin_host = (urlparse(session.get("origin") or "").hostname or "").lower()
    if "facebook.com" not in host and "facebook.com" not in origin_host:
        raise HTTPException(422, "This assisted session is not a Facebook page")

    page = session["page"]
    try:
        html_text = await page.content()
        body_text = await page.locator("body").inner_text(timeout=3000)
    except Exception:
        html_text, body_text = "", ""
    challenge_type, challenge_message = browser._challenge_from(page.url, html_text, body_text)
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

    posts = await _facebook_posts(page)
    candidates = []
    for post in posts:
        product = _post_product(post)
        if product:
            candidates.append(product)
    candidates = universal._dedupe(candidates)

    if not candidates:
        return {
            "session_id": session_id,
            "status": "waiting_for_user",
            "manual_required": True,
            "challenge_type": "navigation",
            "message": (
                "Nexora can see Facebook, but no product posts with a visible price and image were found yet. "
                "Open your Page's Posts/Photos/Shop area in the assisted browser, scroll until products are visible, then click Continue scan again."
            ),
            "count": 0,
            "products": [],
            "social_stats": {"posts_reviewed": len(posts), "product_candidates": 0},
        }

    result = {
        "website_url": session.get("origin"),
        "platform": "facebook-page",
        "products": candidates,
        "manual_required": False,
        "challenge_type": None,
        "manual_message": None,
        "browser_assist_available": True,
        "social_stats": {
            "posts_reviewed": len(posts),
            "product_candidates": len(candidates),
            "ignored_without_visible_price_or_image": max(0, len(posts) - len(candidates)),
        },
        "scan_report": [
            {"stage": "Facebook access", "status": "ok", "detail": "Seller completed any required Facebook login/verification in the temporary browser."},
            {"stage": "Post analysis", "status": "ok", "detail": f"Reviewed {len(posts)} visible post(s) and kept {len(candidates)} price-bearing product candidate(s).", "count": len(candidates)},
        ],
    }
    response = await browser._persist_scan_result(user["id"], result)
    await browser._close_session(session_id)
    return response
