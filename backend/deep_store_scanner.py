"""Deeper catalogue scan coordinator for Nexora PRO imports.

Fast structured/API discovery remains first. For custom stores we also try the
rendered-browser scanner and merge products using stable source identity so
large catalogues are not collapsed merely because multiple products share a
title/price.

Facebook is intentionally routed to the seller-assisted browser flow instead
of being fetched like a normal public ecommerce site.
"""
from urllib.parse import urlparse, urlunparse

import universal_store_scanner as universal
import browser_store_scanner as browser

# A larger public sitemap/page budget helps catalogue-style sites without
# turning every scan into an unlimited crawl.
universal.MAX_PAGES = max(getattr(universal, "MAX_PAGES", 60), 240)
browser.MAX_BROWSER_PAGES = max(getattr(browser, "MAX_BROWSER_PAGES", 40), 160)


def _normalized_source_url(value):
    if not value:
        return ""
    try:
        p = urlparse(str(value))
        query = p.query
        # Keep product IDs but drop common tracking parameters.
        if query:
            parts = []
            for pair in query.split("&"):
                key = pair.split("=", 1)[0].lower()
                if key.startswith("utm_") or key in {"fbclid", "gclid", "ref", "source"}:
                    continue
                parts.append(pair)
            query = "&".join(parts)
        return urlunparse((p.scheme.lower(), p.netloc.lower(), p.path.rstrip("/"), "", query, ""))
    except Exception:
        return str(value).strip().rstrip("/")


def _identity(product):
    key = str(product.get("source_key") or "").strip()
    if key:
        return ("source_key", key)
    url = _normalized_source_url(product.get("source_url"))
    if url:
        return ("url", url)
    sku = str(product.get("sku") or "").strip().lower()
    if sku:
        return ("sku", sku)
    image = ""
    if product.get("images"):
        image = _normalized_source_url(product["images"][0])
    return (
        "fallback",
        str(product.get("title") or "").strip().lower(),
        round(float(product.get("price") or 0), 2),
        image,
    )


def _quality(product):
    score = 0
    score += min(6, len(product.get("images") or []))
    score += 3 if product.get("description") else 0
    score += 3 if product.get("sku") else 0
    score += 2 if product.get("category") else 0
    score += 2 if product.get("brand") else 0
    score += 2 if product.get("stock_known") else 0
    score += 2 if product.get("discount_price") is not None else 0
    return score


def _merge_products(*groups):
    merged = {}
    order = []
    for group in groups:
        for item in group or []:
            if not isinstance(item, dict):
                continue
            ident = _identity(item)
            if ident not in merged:
                merged[ident] = dict(item)
                order.append(ident)
            elif _quality(item) > _quality(merged[ident]):
                # Preserve the first stable key when the richer representation
                # came from a second scanner.
                replacement = dict(item)
                if merged[ident].get("source_key") and not replacement.get("source_key"):
                    replacement["source_key"] = merged[ident]["source_key"]
                merged[ident] = replacement
    return [merged[key] for key in order]


def _facebook_result(raw_url):
    raw = str(raw_url or "").strip()
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    return {
        "website_url": raw,
        "platform": "facebook-page",
        "products": [],
        "manual_required": True,
        "challenge_type": "facebook_navigation",
        "manual_message": (
            "Facebook needs the assisted browser. Open it, sign in or finish "
            "verification yourself if Facebook asks, open the Page posts/photos/"
            "shop area, scroll until products are visible, then click Continue scan."
        ),
        "browser_assist_available": True,
        "scan_report": [
            {
                "stage": "Facebook source",
                "status": "checked",
                "detail": (
                    "Facebook pages are scanned through the seller-assisted browser "
                    "so login/verification is completed by the seller, not bypassed."
                ),
            }
        ],
    }


def composite_scan_sync(raw_url):
    raw = str(raw_url or "").strip()
    with_scheme = raw if raw.startswith(("http://", "https://")) else "https://" + raw
    host = (urlparse(with_scheme).hostname or "").lower()
    if host == "facebook.com" or host.endswith(".facebook.com"):
        return _facebook_result(with_scheme)

    fast = universal.scan_store_sync(raw_url)
    fast_products = fast.get("products") or []

    # Shopify/WooCommerce public catalogue endpoints are already paginated by
    # the universal scanner and are normally the most complete/accurate source.
    if fast.get("platform") in {"shopify", "woocommerce"} and fast_products:
        fast["manual_required"] = False
        fast["browser_assist_available"] = True
        return fast

    rendered = browser.browser_scan_sync(raw_url)
    rendered_products = rendered.get("products") or []
    products = _merge_products(fast_products, rendered_products)

    report = (fast.get("scan_report") or []) + (rendered.get("scan_report") or [])
    platform = fast.get("platform") or rendered.get("platform") or "generic"
    if rendered_products and fast_products:
        platform = "hybrid-scan"
    elif rendered_products:
        platform = rendered.get("platform") or "browser-rendered"

    # If the fast scanner already found products, a missing local browser
    # installation must not invalidate those products.
    manual_required = False
    challenge_type = None
    manual_message = None
    browser_available = rendered.get("browser_assist_available", True)
    if not products:
        manual_required = bool(rendered.get("manual_required", True))
        challenge_type = rendered.get("challenge_type")
        manual_message = rendered.get("manual_message")

    return {
        **fast,
        "website_url": fast.get("website_url") or rendered.get("website_url"),
        "platform": platform,
        "products": products,
        "manual_required": manual_required,
        "challenge_type": challenge_type,
        "manual_message": manual_message,
        "browser_assist_available": browser_available,
        "scan_report": report,
    }
