"""Browser-assisted social catalogue import for seller-owned Facebook pages.

The assisted-browser start route also preserves the exact source path for
ordinary websites, so product/category URLs are not reduced to the homepage.
Facebook login/verification is always completed manually by the seller.
"""
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import new_id
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
    return " ".join(raw.split()[:14])[:140]


def _post_product(post):
    text = post.get("text") or ""
    price = _price(text)
    images = post.get("images") or []
    if not price or price <= 0 or not images or len(text) < 8:
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


class SocialStartBody(BaseModel):
    url: str = Field(min_length=4, max_length=500)
    confirm_rights: bool = False


@router.post("/seller/import-store/manual/start")
@router.post("/seller/import-store/social/manual/start")
async def start_assisted(body: SocialStartBody, user: dict = Depends(seller_dep)):
    await store_importer._require_import(user)
    if not body.confirm_rights:
        raise HTTPException(422, "Confirm ownership/permission before assisted import")
    await browser._cleanup_sessions()

    raw = body.url.strip()
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    parsed = urlparse(raw)
    if not parsed.hostname:
        raise HTTPException(422, "Enter a valid public website or Facebook Page URL")
    universal._assert_public(raw)
    origin = universal._origin(raw)
    is_facebook = "facebook.com" in parsed.hostname.lower()

    for session_id, session in list(browser._manual_sessions.items()):
        if session.get("seller_id") == user["id"]:
            await browser._close_session(session_id)

    try:
        from playwright.async_api import async_playwright
    except Exception:
        raise HTTPException(503, "Browser assistance is not installed. Run: py -m pip install -r requirements.txt")

    pw = await async_playwright().start()
    try:
        try:
            browser_instance = await pw.chromium.launch(channel="chrome", headless=False)
        except Exception:
            browser_instance = await pw.chromium.launch(headless=False)
        context = await browser_instance.new_context()
        await browser._install_async_route(context)
        page = await context.new_page()
        await browser._goto_async(page, raw)
    except Exception as exc:
        try:
            await pw.stop()
        except Exception:
            pass
        raise HTTPException(503, "Could not open the assisted browser. Install Chrome/Chromium or run `py -m playwright install chromium`.") from exc

    session_id = new_id("browser_")
    browser._manual_sessions[session_id] = {
        "seller_id": user["id"],
        "origin": origin,
        "source_url": raw,
        "playwright": pw,
        "browser": browser_instance,
        "context": context,
        "page": page,
        "created_at": datetime.now(timezone.utc),
    }

    try:
        html_text = await page.content()
        body_text = await page.locator("body").inner_text(timeout=2500)
    except Exception:
        html_text, body_text = "", ""
    challenge_type, challenge_message = browser._challenge_from(page.url, html_text, body_text)
    default_message = (
        "Facebook opened on your Page. If asked, log in or finish verification yourself. Open the Page posts/photos/shop area and let products load, then return to Nexora and click Continue scan."
        if is_facebook
        else "Browser opened at the exact source URL. If needed, log in or solve CAPTCHA there. Navigate until products are visible, then return to Nexora and click Continue scan."
    )
    return {
        "session_id": session_id,
        "status": "waiting_for_user",
        "challenge_type": challenge_type or ("facebook_navigation" if is_facebook else "navigation"),
        "message": challenge_message or default_message,
        "expires_in_minutes": browser.MANUAL_TTL_MINUTES,
        "privacy_note": "Credentials stay inside the temporary browser session and are discarded when it closes.",
    }


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
                "Nexora can see Facebook, but no product posts with a visible price and image were found yet. Open your Page's Posts/Photos/Shop area in the assisted browser, scroll until products are visible, then click Continue scan again."
            ),
            "count": 0,
            "products": [],
            "social_stats": {"posts_reviewed": len(posts), "product_candidates": 0},
        }

    result = {
        "website_url": session.get("source_url") or session.get("origin"),
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
