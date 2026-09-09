"""Universal public ecommerce scanner used by Nexora PRO store import.

Layers: Shopify/WooCommerce public APIs, JSON-LD, embedded app JSON,
sitemaps/product links, HTML product metadata, and same-site public product APIs
discovered from JavaScript. It only performs public GET requests and never
bypasses authentication, CAPTCHA, private APIs, or anti-bot controls.
"""
import hashlib
import html
import ipaddress
import json
import re
import socket
from urllib.parse import urljoin, urlparse, urlunparse
from xml.etree import ElementTree

import requests
from fastapi import HTTPException

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/132.0 Safari/537.36 NexoraImporter/2.0"
)
MAX_BYTES = 6 * 1024 * 1024
MAX_PAGES = 60
MAX_SCRIPTS = 10
MAX_API_ENDPOINTS = 12
MAX_NODES = 6000
PRODUCT_PATH_RE = re.compile(
    r"/(?:products?|product-details?|items?|p)(?:/|\?|$)|/collections/[^/]+/products/",
    re.I,
)
PRICE_RE = re.compile(
    r"(?:৳|BDT|Tk\.?|USD|\$|€|£)?\s*([0-9]{1,9}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)",
    re.I,
)


def _origin(raw):
    value = (raw or "").strip()
    if not value.startswith(("http://", "https://")):
        value = "https://" + value
    p = urlparse(value)
    if not p.hostname:
        raise HTTPException(422, "Enter a valid website URL")
    netloc = p.hostname.lower() + (f":{p.port}" if p.port else "")
    return urlunparse((p.scheme.lower(), netloc, "", "", "", ""))


def _assert_public(url):
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname or p.username or p.password:
        raise HTTPException(422, "Only public HTTP/HTTPS websites can be imported")
    port = p.port or (443 if p.scheme == "https" else 80)
    if port not in (80, 443):
        raise HTTPException(422, "Only standard web ports are allowed")
    try:
        infos = socket.getaddrinfo(p.hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise HTTPException(422, "Website host could not be resolved")
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise HTTPException(422, "Private or local network URLs cannot be imported")


def _same_site(base, target):
    a = (urlparse(base).hostname or "").lower()
    b = (urlparse(target).hostname or "").lower()
    return bool(a and b and (a == b or a.endswith("." + b) or b.endswith("." + a)))


def _fetch_text(url):
    current = url
    for _ in range(5):
        _assert_public(current)
        try:
            r = requests.get(
                current,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml,application/json,application/xml,text/xml,*/*",
                    "Accept-Language": "en-US,en;q=0.9,bn;q=0.7",
                    "Cache-Control": "no-cache",
                },
                timeout=15,
                stream=True,
                allow_redirects=False,
            )
        except requests.RequestException as exc:
            raise HTTPException(422, f"Could not reach website: {exc.__class__.__name__}")
        if r.status_code in (301, 302, 303, 307, 308):
            loc = r.headers.get("Location")
            r.close()
            if not loc:
                break
            current = urljoin(current, loc)
            continue
        if r.status_code >= 400:
            code = r.status_code
            r.close()
            raise HTTPException(422, f"Website returned HTTP {code}")
        chunks, total = [], 0
        encoding = r.encoding or "utf-8"
        try:
            for chunk in r.iter_content(65536):
                if not chunk:
                    continue
                total += len(chunk)
                if total > MAX_BYTES:
                    raise HTTPException(413, "Website response is too large")
                chunks.append(chunk)
        finally:
            r.close()
        return b"".join(chunks).decode(encoding, errors="replace"), current
    raise HTTPException(422, "Too many website redirects")


def _fetch_json(url):
    text, final_url = _fetch_text(url)
    try:
        return json.loads(text), final_url
    except Exception:
        return None, final_url


def _number(value):
    if value in (None, "") or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return round(float(value), 2)
    if isinstance(value, dict):
        for key in ("amount", "value", "price", "current", "sale", "min", "lowPrice"):
            if key in value:
                found = _number(value.get(key))
                if found is not None:
                    return found
        return None
    if isinstance(value, list):
        for item in value:
            found = _number(item)
            if found is not None:
                return found
        return None
    m = PRICE_RE.search(str(value).replace("\u00a0", " "))
    if not m:
        return None
    try:
        return round(float(m.group(1).replace(",", "")), 2)
    except Exception:
        return None


def _text(value):
    if value is None:
        return ""
    if isinstance(value, dict):
        value = value.get("name") or value.get("title") or value.get("value") or ""
    if isinstance(value, list):
        value = " ".join(str(x) for x in value if isinstance(x, (str, int, float)))
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", str(value)))).strip()


def _images(value, base_url):
    out = []

    def walk(v, depth=0):
        if depth > 4 or len(out) >= 12:
            return
        if isinstance(v, str):
            u = urljoin(base_url, v.strip())
            if u.startswith(("http://", "https://")) and u not in out:
                if re.search(r"\.(?:jpe?g|png|webp|gif|avif)(?:\?|$)", u, re.I) or "image" in u.lower():
                    out.append(u)
        elif isinstance(v, dict):
            for key in ("src", "url", "secure_url", "contentUrl", "originalSrc", "original", "large", "medium", "thumbnail"):
                if key in v:
                    walk(v.get(key), depth + 1)
        elif isinstance(v, list):
            for x in v:
                walk(x, depth + 1)

    walk(value)
    return out[:12]


def _key(platform, external_id, source_url):
    raw = f"{platform}|{external_id}|{source_url}".encode()
    return hashlib.sha256(raw).hexdigest()[:32]


def _product(platform, external_id, source_url, title, price, *, description="", discount_price=None,
             images=None, sku="", stock=0, stock_known=False, category="", brand=""):
    regular, discount = _number(price), _number(discount_price)
    if regular is None and discount is not None:
        regular, discount = discount, None
    if regular is None:
        return None
    if discount is not None and discount >= regular:
        discount = None
    title = _text(title)
    if len(title) < 2:
        return None
    try:
        stock = max(0, int(float(stock or 0)))
    except Exception:
        stock = 0
    return {
        "source_key": _key(platform, str(external_id or ""), source_url),
        "platform": platform,
        "external_id": str(external_id or ""),
        "source_url": source_url,
        "title": title[:300],
        "description": _text(description)[:10000],
        "price": regular,
        "discount_price": discount,
        "images": _images(images or [], source_url),
        "sku": str(sku or "")[:120],
        "stock": stock,
        "stock_known": bool(stock_known),
        "category": _text(category)[:120],
        "brand": _text(brand)[:120],
    }


def _dedupe(products):
    out, seen = [], set()
    for p in products:
        if not p:
            continue
        identity = (p.get("title", "").lower(), p.get("price"), (p.get("source_url") or "").rstrip("/"))
        if identity in seen:
            continue
        seen.add(identity)
        out.append(p)
    return out


def _shopify(origin):
    out = []
    for page in range(1, 5):
        data, _ = _fetch_json(f"{origin}/products.json?limit=250&page={page}")
        if not isinstance(data, dict) or not isinstance(data.get("products"), list):
            break
        batch = data["products"]
        if not batch:
            break
        for p in batch:
            variants = p.get("variants") or []
            first = variants[0] if variants else {}
            current = _number(first.get("price"))
            compare = _number(first.get("compare_at_price"))
            regular = compare if compare not in (None, 0) else current
            discount = current if current is not None and regular is not None and current < regular else None
            stocks = [v.get("inventory_quantity") for v in variants if isinstance(v.get("inventory_quantity"), int)]
            handle = p.get("handle") or ""
            item = _product(
                "shopify", p.get("id"), f"{origin}/products/{handle}" if handle else origin,
                p.get("title"), regular, description=p.get("body_html") or "",
                discount_price=discount, images=p.get("images") or [], sku=first.get("sku") or "",
                stock=sum(max(0, x) for x in stocks), stock_known=bool(stocks),
                category=p.get("product_type") or "", brand=p.get("vendor") or "",
            )
            if item:
                out.append(item)
        if len(batch) < 250:
            break
    return _dedupe(out)


def _woo_price(prices, key):
    if not isinstance(prices, dict) or prices.get(key) is None:
        return None
    try:
        return float(prices[key]) / (10 ** int(prices.get("currency_minor_unit", 2)))
    except Exception:
        return None


def _woocommerce(origin):
    out = []
    for page in range(1, 5):
        data, _ = _fetch_json(f"{origin}/wp-json/wc/store/v1/products?per_page=100&page={page}")
        if not isinstance(data, list):
            break
        if not data:
            break
        for p in data:
            prices = p.get("prices") or {}
            regular = _woo_price(prices, "regular_price")
            current = _woo_price(prices, "price")
            regular = regular if regular is not None else current
            discount = current if current is not None and regular is not None and current < regular else None
            cats = p.get("categories") or []
            category = cats[0].get("name", "") if cats and isinstance(cats[0], dict) else ""
            item = _product(
                "woocommerce", p.get("id"), p.get("permalink") or origin, p.get("name"), regular,
                description=p.get("description") or p.get("short_description") or "",
                discount_price=discount, images=p.get("images") or [], sku=p.get("sku") or "",
                stock=p.get("stock_quantity") or 0,
                stock_known=isinstance(p.get("stock_quantity"), (int, float)), category=category,
            )
            if item:
                out.append(item)
        if len(data) < 100:
            break
    return _dedupe(out)


def _flatten(value):
    if isinstance(value, list):
        out = []
        for x in value:
            out.extend(_flatten(x))
        return out
    if isinstance(value, dict) and isinstance(value.get("@graph"), list):
        return _flatten(value["@graph"])
    return [value] if isinstance(value, dict) else []


def _jsonld_products(page_html, page_url):
    blocks = re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', page_html, re.I | re.S)
    out = []
    for raw in blocks:
        try:
            data = json.loads(html.unescape(raw.strip()))
        except Exception:
            continue
        for obj in _flatten(data):
            typ = obj.get("@type")
            types = [str(x).lower() for x in typ] if isinstance(typ, list) else [str(typ).lower()]
            if "product" not in types:
                continue
            offers = obj.get("offers") or {}
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            if not isinstance(offers, dict):
                offers = {}
            source = obj.get("url") or page_url
            source = urljoin(page_url, source) if isinstance(source, str) else page_url
            brand = obj.get("brand") or ""
            if isinstance(brand, dict):
                brand = brand.get("name") or ""
            availability = str(offers.get("availability") or "").lower()
            item = _product(
                "jsonld", obj.get("sku") or obj.get("productID") or obj.get("@id") or source,
                source, obj.get("name"), offers.get("price") or offers.get("lowPrice") or offers.get("highPrice"),
                description=obj.get("description") or "", images=obj.get("image") or [], sku=obj.get("sku") or "",
                stock=0 if "outofstock" in availability else (1 if availability else 0),
                stock_known=bool(availability), category=obj.get("category") or "", brand=brand,
            )
            if item:
                out.append(item)
    return _dedupe(out)


def _get(obj, *names):
    lower = {str(k).lower(): v for k, v in obj.items()}
    for name in names:
        if name.lower() in lower:
            return lower[name.lower()]
    return None


def _mapping_product(obj, page_url, platform="embedded"):
    if not isinstance(obj, dict) or len(obj) > 250:
        return None
    title = _get(obj, "title", "name", "productName", "product_name")
    if not title:
        return None
    current = _get(obj, "salePrice", "sale_price", "discountPrice", "discount_price", "sellingPrice", "currentPrice", "current_price", "price")
    regular = _get(obj, "compareAtPrice", "compare_at_price", "regularPrice", "regular_price", "originalPrice", "original_price", "mrp", "listPrice")
    current_n, regular_n = _number(current), _number(regular)
    if current_n is None and regular_n is None:
        variants = _get(obj, "variants", "skus", "options")
        if isinstance(variants, list) and variants and isinstance(variants[0], dict):
            return _mapping_product({**obj, **variants[0]}, page_url, platform)
        return None
    if regular_n is None:
        regular_n, discount_n = current_n, None
    else:
        discount_n = current_n if current_n is not None and current_n < regular_n else None
    source = _get(obj, "url", "permalink", "href", "productUrl", "product_url")
    slug = _get(obj, "slug", "handle")
    source_url = urljoin(page_url, source) if isinstance(source, str) else (
        urljoin(page_url, f"/products/{slug}") if isinstance(slug, str) else page_url
    )
    external_id = _get(obj, "id", "_id", "productId", "product_id", "sku", "slug", "handle") or source_url
    stock_value = _get(obj, "stock", "quantity", "inventory", "inventoryQuantity", "inventory_quantity", "stockQuantity", "stock_quantity")
    stock_n = _number(stock_value)
    stock_known = stock_n is not None
    if not stock_known:
        available = _get(obj, "availability", "inStock", "in_stock", "available")
        if isinstance(available, bool):
            stock_n, stock_known = (1 if available else 0), True
        elif isinstance(available, str) and available:
            stock_n, stock_known = (0 if "out" in available.lower() else 1), True
    supporting = sum(
        _get(obj, key) not in (None, "", [], {})
        for key in ("images", "image", "sku", "category", "brand", "description", "stock", "variants", "slug", "handle")
    )
    if supporting == 0 and not PRODUCT_PATH_RE.search(source_url):
        return None
    return _product(
        platform, external_id, source_url, title, regular_n, discount_price=discount_n,
        description=_get(obj, "description", "body", "summary", "shortDescription", "short_description") or "",
        images=_get(obj, "images", "image", "photos", "media", "thumbnail", "featuredImage", "featured_image") or [],
        sku=_get(obj, "sku", "code") or "", stock=stock_n or 0, stock_known=stock_known,
        category=_get(obj, "category", "categoryName", "category_name", "productType", "product_type") or "",
        brand=_get(obj, "brand", "vendor", "manufacturer") or "",
    )


def _embedded_products(value, page_url, platform="embedded"):
    out, stack, visited = [], [value], 0
    while stack and visited < MAX_NODES:
        current = stack.pop()
        visited += 1
        if isinstance(current, dict):
            item = _mapping_product(current, page_url, platform)
            if item:
                out.append(item)
            stack.extend(current.values())
        elif isinstance(current, list):
            stack.extend(current)
    return _dedupe(out)


def _script_json_products(page_html, page_url):
    out = []
    patterns = [
        r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>',
        r'<script[^>]*type=["\']application/json["\'][^>]*>(.*?)</script>',
    ]
    for pattern in patterns:
        for raw in re.findall(pattern, page_html, re.I | re.S):
            if len(raw) > MAX_BYTES:
                continue
            try:
                data = json.loads(html.unescape(raw.strip()))
            except Exception:
                continue
            out.extend(_embedded_products(data, page_url, "embedded"))
    return _dedupe(out)


def _meta(page_html, names):
    for name in names:
        esc = re.escape(name)
        patterns = [
            rf'<meta[^>]+(?:property|name|itemprop)=["\']{esc}["\'][^>]+content=["\']([^"\']+)',
            rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name|itemprop)=["\']{esc}["\']',
        ]
        for pattern in patterns:
            m = re.search(pattern, page_html, re.I)
            if m:
                return html.unescape(m.group(1)).strip()
    return ""


def _html_product(page_html, page_url):
    signal = bool(
        PRODUCT_PATH_RE.search(page_url)
        or re.search(r'(?:property|name)=["\']og:type["\'][^>]+content=["\']product', page_html, re.I)
        or re.search(r'add\s*to\s*(?:cart|bag)|buy\s*now', page_html, re.I)
        or re.search(r'itemtype=["\'][^"\']*schema\.org/Product', page_html, re.I)
    )
    if not signal:
        return None
    title = _meta(page_html, ["og:title", "twitter:title"])
    if not title:
        m = re.search(r"<h1[^>]*>(.*?)</h1>", page_html, re.I | re.S)
        title = _text(m.group(1)) if m else ""
    regular = _number(_meta(page_html, ["product:price:amount", "og:price:amount", "price"]))
    current = _number(_meta(page_html, ["product:sale_price:amount", "sale_price", "discount_price"]))
    if regular is None:
        candidates = re.findall(
            r'(?:data-(?:sale-)?price|class=["\'][^"\']*(?:sale-)?price[^"\']*["\'])[^>]{0,180}?["\']?([^<"\']{1,40})',
            page_html, re.I,
        )
        nums = [_number(x) for x in candidates]
        nums = [x for x in nums if x is not None and x > 0]
        if nums:
            regular = max(nums[:5])
            current = min(nums[:5]) if min(nums[:5]) < regular else None
    if regular is None:
        return None
    image = _meta(page_html, ["og:image", "twitter:image", "image"])
    description = _meta(page_html, ["og:description", "description", "twitter:description"])
    sku = _meta(page_html, ["product:retailer_item_id", "sku"])
    availability = _meta(page_html, ["product:availability", "availability"])
    canonical = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)', page_html, re.I)
    source_url = urljoin(page_url, canonical.group(1)) if canonical else page_url
    return _product(
        "html", sku or source_url, source_url, title, regular,
        discount_price=current if current is not None and current < regular else None,
        description=description, images=[image] if image else [], sku=sku,
        stock=0 if "out" in availability.lower() else (1 if availability else 0),
        stock_known=bool(availability), brand=_meta(page_html, ["product:brand", "brand"]),
    )


def _scan_html(page_html, page_url):
    out = _jsonld_products(page_html, page_url) + _script_json_products(page_html, page_url)
    item = _html_product(page_html, page_url)
    if item:
        out.append(item)
    return _dedupe(out)


def _links(page_html, page_url, origin):
    out = []
    for raw in re.findall(r'<a[^>]+href=["\']([^"\'#]+)', page_html, re.I):
        target = urljoin(page_url, html.unescape(raw).strip())
        p = urlparse(target)
        clean = urlunparse((p.scheme, p.netloc, p.path, "", p.query, ""))
        if p.scheme in ("http", "https") and _same_site(origin, clean) and clean not in out:
            out.append(clean)
    return out


def _sitemap_pages(origin):
    queue = [
        f"{origin}/sitemap.xml", f"{origin}/sitemap_index.xml", f"{origin}/product-sitemap.xml",
        f"{origin}/wp-sitemap-posts-product-1.xml", f"{origin}/sitemap_products_1.xml",
    ]
    try:
        robots, _ = _fetch_text(f"{origin}/robots.txt")
        for u in re.findall(r"^\s*Sitemap:\s*(\S+)", robots, re.I | re.M):
            if _same_site(origin, u) and u not in queue:
                queue.append(u)
    except Exception:
        pass
    pages, seen_maps = [], set()
    while queue and len(seen_maps) < 14 and len(pages) < 500:
        candidate = queue.pop(0)
        if candidate in seen_maps:
            continue
        seen_maps.add(candidate)
        try:
            text, _ = _fetch_text(candidate)
            root = ElementTree.fromstring(text)
        except Exception:
            continue
        for node in root.iter():
            if not node.tag.lower().endswith("loc") or not node.text:
                continue
            u = node.text.strip()
            if not _same_site(origin, u):
                continue
            if u.lower().endswith(".xml") or "sitemap" in urlparse(u).path.lower():
                if u not in seen_maps and len(queue) < 20:
                    queue.append(u)
            elif u not in pages:
                pages.append(u)
    preferred = [u for u in pages if PRODUCT_PATH_RE.search(u)]
    return (preferred + [u for u in pages if u not in preferred])[:MAX_PAGES]


def _api_urls(text, base_url, origin):
    out = []
    patterns = [
        r'["\']((?:https?://[^"\']+|/[^"\']*)/(?:api/)?[^"\']*(?:products?|catalog)[^"\']*)["\']',
        r'["\']((?:https?://[^"\']+|/api/)[^"\']*(?:shop|store)[^"\']*(?:products?|catalog)[^"\']*)["\']',
    ]
    for pattern in patterns:
        for raw in re.findall(pattern, text, re.I):
            if "{" in raw or "}" in raw or len(raw) > 300:
                continue
            target = urljoin(base_url, raw.replace("\\/", "/"))
            p = urlparse(target)
            if p.scheme in ("http", "https") and _same_site(origin, target) and not p.path.lower().endswith((".js", ".css", ".map")):
                clean = urlunparse((p.scheme, p.netloc, p.path, "", p.query, ""))
                if clean not in out:
                    out.append(clean)
    return out[:MAX_API_ENDPOINTS]


def _public_api_products(origin, homepage_html, homepage_url):
    candidates = [f"{origin}/api/products", f"{origin}/api/catalog/products", f"{origin}/api/shop/products"]
    candidates += _api_urls(homepage_html, homepage_url, origin)
    scripts = []
    for raw in re.findall(r'<script[^>]+src=["\']([^"\']+)', homepage_html, re.I):
        u = urljoin(homepage_url, html.unescape(raw).strip())
        if _same_site(origin, u) and u not in scripts:
            scripts.append(u)
    for script_url in scripts[:MAX_SCRIPTS]:
        try:
            script_text, final = _fetch_text(script_url)
        except Exception:
            continue
        candidates += _api_urls(script_text, final, origin)
    unique = []
    for u in candidates:
        if u not in unique and _same_site(origin, u):
            unique.append(u)
    out, checked = [], []
    for endpoint in unique[:MAX_API_ENDPOINTS]:
        try:
            data, final = _fetch_json(endpoint)
        except Exception:
            continue
        checked.append(endpoint)
        if data is not None:
            out += _embedded_products(data, final, "public_api")
    return _dedupe(out), checked


def _generic(origin):
    report = []
    homepage_html, homepage_url = _fetch_text(origin)
    report.append({"stage": "Homepage", "status": "ok", "detail": "Public homepage loaded."})

    products = _scan_html(homepage_html, homepage_url)
    report.append({
        "stage": "Structured & embedded data", "status": "ok" if products else "checked",
        "detail": f"Found {len(products)} product(s) in JSON-LD, HTML metadata, or embedded app JSON.",
        "count": len(products),
    })

    sitemap_urls = _sitemap_pages(origin)
    report.append({
        "stage": "Sitemaps", "status": "ok" if sitemap_urls else "checked",
        "detail": f"Discovered {len(sitemap_urls)} candidate page(s) from public sitemaps/robots.txt.",
        "count": len(sitemap_urls),
    })

    home_links = _links(homepage_html, homepage_url, origin)
    product_links = [u for u in home_links if PRODUCT_PATH_RE.search(u)]
    listing_links = [u for u in home_links if re.search(r"/(?:shop|store|collections?|category|catalog)(?:/|\?|$)", u, re.I)]
    for listing_url in listing_links[:8]:
        try:
            listing_html, final = _fetch_text(listing_url)
        except Exception:
            continue
        products += _scan_html(listing_html, final)
        for u in _links(listing_html, final, origin):
            if PRODUCT_PATH_RE.search(u) and u not in product_links:
                product_links.append(u)

    candidate_pages = []
    for u in product_links + sitemap_urls:
        if u not in candidate_pages:
            candidate_pages.append(u)
    report.append({
        "stage": "Product links", "status": "ok" if candidate_pages else "checked",
        "detail": f"Queued {min(len(candidate_pages), MAX_PAGES)} public product/page candidate(s) for extraction.",
        "count": min(len(candidate_pages), MAX_PAGES),
    })

    pages_checked = 0
    for page_url in candidate_pages[:MAX_PAGES]:
        try:
            page_html, final = _fetch_text(page_url)
        except Exception:
            continue
        pages_checked += 1
        products += _scan_html(page_html, final)
    products = _dedupe(products)
    report.append({
        "stage": "Product pages", "status": "ok" if products else "checked",
        "detail": f"Read {pages_checked} public page(s); {len(products)} unique product(s) available so far.",
        "count": len(products),
    })

    api_products, checked = _public_api_products(origin, homepage_html, homepage_url)
    products = _dedupe(products + api_products)
    report.append({
        "stage": "Public app/API discovery", "status": "ok" if api_products else "checked",
        "detail": f"Checked {len(checked)} same-site public product endpoint(s); found {len(api_products)} additional product(s).",
        "count": len(api_products),
    })
    return products, report


def scan_store_sync(raw_url):
    origin = _origin(raw_url)
    _assert_public(origin)
    report = []
    try:
        products = _shopify(origin)
        report.append({"stage": "Shopify", "status": "ok" if products else "checked", "detail": f"Public Shopify catalogue: {len(products)} product(s).", "count": len(products)})
        if products:
            return {"website_url": origin, "platform": "shopify", "products": products, "scan_report": report}
    except HTTPException:
        report.append({"stage": "Shopify", "status": "checked", "detail": "No public Shopify catalogue detected."})
    try:
        products = _woocommerce(origin)
        report.append({"stage": "WooCommerce", "status": "ok" if products else "checked", "detail": f"Public WooCommerce catalogue: {len(products)} product(s).", "count": len(products)})
        if products:
            return {"website_url": origin, "platform": "woocommerce", "products": products, "scan_report": report}
    except HTTPException:
        report.append({"stage": "WooCommerce", "status": "checked", "detail": "No public WooCommerce Store API catalogue detected."})

    products, generic_report = _generic(origin)
    platforms = {p.get("platform") for p in products}
    if "public_api" in platforms:
        platform = "custom-api"
    elif "embedded" in platforms:
        platform = "custom-app"
    elif "jsonld" in platforms:
        platform = "structured-data"
    else:
        platform = "generic"
    return {"website_url": origin, "platform": platform, "products": products, "scan_report": report + generic_report}
