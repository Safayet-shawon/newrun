"""Nexora catalogue review engine v2.

The scanner finds candidates; this layer prepares them for a clean marketplace
catalogue. It maps to live Nexora categories, extracts common variants, applies
category-aware required fields, keeps a continuous catalogue chat history, and
auto-ignores only high-confidence duplicates based on stable source identity.
"""
import re
from typing import List, Optional
from urllib.parse import urlparse, urlunparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from db import db, new_id, now_iso
from entitlements import get_entitlements
from product_rules import validate_product
from security import require_role
import store_importer
from rate_limit import check_rate_limit

router = APIRouter()
seller_dep = require_role("seller")

CATEGORY_HINTS = {
    "fashion": ["shirt", "t shirt", "tshirt", "tee", "panjabi", "punjabi", "kurti", "saree", "sari", "dress", "jeans", "trouser", "pant", "hoodie", "jacket", "blazer", "lehenga", "gown", "scarf", "dupatta", "polo", "salwar", "kameez", "palazzo", "frock", "skirt", "clothing", "fashion", "sweatshirt", "cargo", "pajama"],
    "food": ["cake", "cupcake", "brownie", "pastry", "bakery", "dessert", "cookie", "chocolate", "macaron", "cheesecake", "food", "snack"],
    "electronics": ["earbud", "headphone", "charger", "keyboard", "mouse", "speaker", "smart watch", "smartwatch", "phone", "laptop", "camera", "power bank", "usb", "electronic", "adapter", "cable"],
    "beauty": ["serum", "lipstick", "makeup", "skincare", "cream", "cleanser", "sunscreen", "toner", "foundation", "beauty", "cosmetic", "perfume"],
    "furniture": ["sofa", "chair", "table", "desk", "lamp", "bookshelf", "furniture", "pillow", "vase", "home decor", "bed", "cabinet"],
    "grocery": ["rice", "oil", "egg", "vegetable", "fruit", "grocery", "tomato", "spinach", "banana", "food pack", "flour", "spice"],
    "jewellery": ["necklace", "earring", "bangle", "pendant", "jewellery", "jewelry", "gold", "choker", "ring", "bracelet"],
    "sports": ["football", "cricket", "gym", "dumbbell", "yoga", "sports", "training", "running", "jersey", "fitness"],
    "books": ["book", "novel", "anthology", "poetry", "guide", "cookbook", "fiction", "magazine"],
    "pets": ["cat", "dog", "pet", "litter", "scratcher", "teaser", "pet toy", "cat food", "dog food", "pet house", "collar", "leash", "grooming", "aquarium", "bird", "kitten", "puppy", "treat"],
}

CATEGORY_NAMES = {
    "fashion": "Fashion",
    "food": "Cakes & Bakery",
    "electronics": "Electronics",
    "beauty": "Beauty",
    "furniture": "Furniture & Home",
    "grocery": "Grocery",
    "jewellery": "Jewellery",
    "sports": "Sports",
    "books": "Books",
    "pets": "Pets",
}

COLOR_WORDS = ["black", "white", "red", "blue", "green", "yellow", "orange", "purple", "pink", "brown", "grey", "gray", "navy", "beige", "maroon", "gold", "silver", "cream", "olive", "teal", "khaki", "charcoal", "mustard"]
SIZE_RE = re.compile(r"(?<![A-Za-z0-9])(?:XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL|[2-9][0-9])(?=$|[\s,;/|)\]])", re.I)
APPAREL_WORDS = ("shirt", "tshirt", "t shirt", "tee", "panjabi", "kurti", "saree", "dress", "jeans", "trouser", "pant", "hoodie", "jacket", "blazer", "lehenga", "gown", "polo", "salwar", "kameez", "palazzo", "frock", "skirt", "sweatshirt", "jersey", "pajama")
FOOTWEAR_WORDS = ("shoe", "shoes", "sneaker", "sandal", "loafer", "boot")


def _norm(text):
    return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()


def _uniq(values):
    out, seen = [], set()
    for value in values or []:
        clean = str(value).strip()
        marker = clean.lower()
        if clean and marker not in seen:
            seen.add(marker)
            out.append(clean)
    return out


def _normalized_url(value):
    if not value:
        return ""
    try:
        p = urlparse(str(value))
        query = []
        for pair in p.query.split("&") if p.query else []:
            key = pair.split("=", 1)[0].lower()
            if key.startswith("utm_") or key in {"fbclid", "gclid", "ref", "source"}:
                continue
            query.append(pair)
        return urlunparse((p.scheme.lower(), p.netloc.lower(), p.path.rstrip("/"), "", "&".join(query), ""))
    except Exception:
        return str(value).strip().rstrip("/")


def _extract_sizes(text):
    return _uniq(m.group(0).upper() for m in SIZE_RE.finditer(text or ""))[:30]


def _extract_colors(text):
    lower = f" {_norm(text)} "
    return _uniq(color.title() for color in COLOR_WORDS if f" {color} " in lower)[:30]


def _source_text(item):
    return " ".join(str(item.get(key) or "") for key in ("title", "description", "brand", "category"))


def _category_score(text, slug, name):
    hay = f" {_norm(text)} "
    score = 0
    slug_text, name_text = _norm(slug), _norm(name)
    if slug_text and f" {slug_text} " in hay:
        score += 8
    if name_text and f" {name_text} " in hay:
        score += 8
    for hint in CATEGORY_HINTS.get(slug, []):
        hint_n = _norm(hint)
        if hint_n and f" {hint_n} " in hay:
            score += 5
        elif hint_n and hint_n in hay:
            score += 2
    return score


def _map_category(item, categories, fallback=None):
    current = str(item.get("category") or "").strip().lower()
    by_slug = {c.get("slug"): c for c in categories if c.get("slug")}
    if current in by_slug:
        return current, 1.0
    text = _source_text(item)
    best_slug, best_score = None, 0
    for cat in categories:
        slug = cat.get("slug")
        if not slug:
            continue
        score = _category_score(text, slug, cat.get("name") or slug)
        if score > best_score:
            best_slug, best_score = slug, score
    if best_slug and best_score >= 2:
        return best_slug, min(0.99, 0.52 + best_score * 0.035)
    if fallback in by_slug:
        return fallback, 0.25
    return None, 0.0


def _subcategory(item):
    text = _norm(_source_text(item))
    rules = [
        ("Panjabi", ("panjabi", "punjabi")),
        ("T-Shirts", ("t shirt", "tshirt", "tee")),
        ("Shirts", ("shirt",)),
        ("Hoodies", ("hoodie",)),
        ("Saree", ("saree", "sari")),
        ("Kurti", ("kurti",)),
        ("Shoes", FOOTWEAR_WORDS),
        ("Pet Toys", ("pet toy", "teaser", "scratcher", "ball toy")),
        ("Pet Food", ("cat food", "dog food", "pet food", "treat")),
        ("Pet Accessories", ("collar", "leash", "litter", "pet house")),
        ("Earbuds", ("earbud", "tws")),
        ("Headphones", ("headphone",)),
    ]
    for label, words in rules:
        if any(_norm(word) in text for word in words):
            return label
    return ""


def _variant_values(item):
    text = " ".join([str(item.get("title") or ""), str(item.get("description") or "")])
    sizes = list(item.get("sizes") or []) or _extract_sizes(text)
    colors = list(item.get("colors") or []) or _extract_colors(text)
    return _uniq(sizes), _uniq(colors)


def _is_apparel(item):
    text = _norm(f"{item.get('title')} {item.get('description')}")
    if item.get("category") == "fashion":
        return any(word in text for word in APPAREL_WORDS + FOOTWEAR_WORDS)
    if item.get("category") == "sports":
        return any(word in text for word in ("jersey", "shirt", "shorts", "trouser", "shoe"))
    return any(word in text for word in FOOTWEAR_WORDS)


def _required_fields(item):
    missing = []
    if not str(item.get("title") or "").strip():
        missing.append("title")
    try:
        if float(item.get("price") or 0) <= 0:
            missing.append("price")
    except Exception:
        missing.append("price")
    if not item.get("category"):
        missing.append("category")
    if not item.get("images"):
        missing.append("image")
    if _is_apparel(item):
        if not item.get("sizes"):
            missing.append("size")
        if not item.get("colors"):
            missing.append("color")
    return _uniq(missing)


def _possible_title_duplicate(item, existing_title_prices):
    fp = (_norm(item.get("title")), round(float(item.get("price") or 0), 2))
    return bool(fp[0] and fp in existing_title_prices)


async def _existing_duplicate_sets(shop_id):
    docs = await db.products.find({"shop_id": shop_id}, {"_id": 0, "title": 1, "price": 1, "sku": 1, "source_import.source_key": 1, "source_import.source_url": 1}).to_list(20000)
    source_keys, source_urls, skus, title_prices = set(), set(), set(), set()
    for doc in docs:
        source = doc.get("source_import") or {}
        if source.get("source_key"):
            source_keys.add(str(source["source_key"]))
        if source.get("source_url"):
            source_urls.add(_normalized_url(source["source_url"]))
        if doc.get("sku"):
            skus.add(str(doc["sku"]).strip().lower())
        title_prices.add((_norm(doc.get("title")), round(float(doc.get("price") or 0), 2)))
    return source_keys, source_urls, skus, title_prices


async def ensure_import_categories():
    await db.categories.update_one(
        {"slug": "pets"},
        {"$setOnInsert": {"slug": "pets", "name": "Pets", "theme": "pet_lifestyle", "icon": "paw-print"}},
        upsert=True,
    )


async def prepare_scan(scan_id, user_id):
    scan = await db.store_import_scans.find_one({"id": scan_id, "seller_id": user_id}, {"_id": 0})
    if not scan:
        raise HTTPException(404, "Import scan expired or was not found")
    shop = await db.shops.find_one({"seller_id": user_id}, {"_id": 0})
    if not shop:
        raise HTTPException(400, "Complete seller onboarding first")

    await ensure_import_categories()
    categories = await db.categories.find({}, {"_id": 0}).to_list(300)
    existing_keys, existing_urls, existing_skus, existing_title_prices = await _existing_duplicate_sets(shop["id"])

    seen_keys, seen_urls, seen_skus, seen_fallback = set(), set(), set(), set()
    prepared = []
    for raw in scan.get("products", []):
        item = dict(raw)
        category, confidence = _map_category(item, categories, shop.get("category"))
        item["category"] = category
        item["category_confidence"] = round(confidence, 2)
        item["suggested_subcategory"] = _subcategory(item)
        sizes, colors = _variant_values(item)
        item["sizes"], item["colors"] = sizes, colors

        source_key = str(item.get("source_key") or "").strip()
        source_url = _normalized_url(item.get("source_url"))
        sku = str(item.get("sku") or "").strip().lower()
        fallback = (_norm(item.get("title")), round(float(item.get("price") or 0), 2), _normalized_url((item.get("images") or [""])[0]))

        duplicate_reason = None
        if source_key and source_key in existing_keys:
            duplicate_reason = "already imported from this exact source"
        elif source_url and source_url in existing_urls:
            duplicate_reason = "this exact source product is already in your Nexora shop"
        elif sku and sku in existing_skus:
            duplicate_reason = "the same SKU already exists in your Nexora shop"
        elif source_key and source_key in seen_keys:
            duplicate_reason = "same source product appeared more than once in this scan"
        elif source_url and source_url in seen_urls:
            duplicate_reason = "same product URL appeared more than once in this scan"
        elif sku and sku in seen_skus:
            duplicate_reason = "same SKU appeared more than once in this scan"
        elif not source_key and not source_url and not sku and fallback in seen_fallback:
            duplicate_reason = "same title, price and image appeared more than once in this scan"

        if source_key:
            seen_keys.add(source_key)
        if source_url:
            seen_urls.add(source_url)
        if sku:
            seen_skus.add(sku)
        seen_fallback.add(fallback)

        missing = _required_fields(item)
        item["missing_fields"] = missing
        item["duplicate"] = bool(duplicate_reason)
        item["duplicate_reason"] = duplicate_reason
        item["possible_duplicate"] = not duplicate_reason and _possible_title_duplicate(item, existing_title_prices)
        item["ignored"] = bool(duplicate_reason)
        item["ready"] = not missing and not duplicate_reason
        notes = []
        if category:
            notes.append(f"Mapped to {CATEGORY_NAMES.get(category, category)} ({int(confidence * 100)}% confidence)")
        else:
            notes.append("Choose a Nexora category")
        if item["suggested_subcategory"]:
            notes.append(f"suggested group: {item['suggested_subcategory']}")
        if item["possible_duplicate"]:
            notes.append("similar title/price already exists, but it was not auto-ignored because the source identity is different")
        item["ai_note"] = ". ".join(notes) + "."
        prepared.append(item)

    summary = _summary(prepared)
    history = list(scan.get("assistant_chat") or [])
    if not history:
        history = [{"id": new_id("chat_"), "role": "assistant", "message": f"I reviewed {summary['total']} product candidates. {summary['ready']} are ready, {summary['incomplete']} need details, and {summary['duplicates']} exact duplicates were auto-ignored. Tell me what you want to keep, ignore, or re-categorize.", "created_at": now_iso()}]

    update = {"products": prepared, "ai_prepared": True, "ai_summary": summary, "assistant_chat": history[-60:], "updated_at": now_iso()}
    await db.store_import_scans.update_one({"id": scan_id, "seller_id": user_id}, {"$set": update})
    return {**scan, **update, "count": len(prepared), "categories": categories}


def _summary(products):
    return {
        "total": len(products),
        "ready": sum(1 for p in products if p.get("ready") and not p.get("ignored") and not p.get("duplicate")),
        "incomplete": sum(1 for p in products if p.get("missing_fields") and not p.get("duplicate") and not p.get("ignored")),
        "duplicates": sum(1 for p in products if p.get("duplicate")),
        "possible_duplicates": sum(1 for p in products if p.get("possible_duplicate")),
        "ignored": sum(1 for p in products if p.get("ignored")),
    }


@router.post("/seller/import-store/ai/prepare/{scan_id}")
async def prepare(scan_id: str, request: Request, user: dict = Depends(seller_dep)):
    await check_rate_limit(request, action="catalogue-ai-prepare", limit=20, window_seconds=3600, identity=user["id"])
    await store_importer._require_import(user)
    return await prepare_scan(scan_id, user["id"])


class ProductPatch(BaseModel):
    category: Optional[str] = None
    sizes: Optional[List[str]] = None
    colors: Optional[List[str]] = None
    ignored: Optional[bool] = None
    title: Optional[str] = None
    description: Optional[str] = None
    brand: Optional[str] = None
    sku: Optional[str] = None
    price: Optional[float] = None
    discount_price: Optional[float] = None
    image_url: Optional[str] = None


@router.patch("/seller/import-store/ai/prepare/{scan_id}/product/{source_key}")
async def patch_product(scan_id: str, source_key: str, body: ProductPatch, user: dict = Depends(seller_dep)):
    await store_importer._require_import(user)
    scan = await db.store_import_scans.find_one({"id": scan_id, "seller_id": user["id"]}, {"_id": 0})
    if not scan:
        raise HTTPException(404, "Import scan expired or was not found")
    await ensure_import_categories()
    categories = await db.categories.find({}, {"_id": 0}).to_list(300)
    valid_categories = {c.get("slug") for c in categories}
    products = scan.get("products", [])
    found = False
    for item in products:
        if item.get("source_key") != source_key:
            continue
        found = True
        if body.category is not None:
            if body.category not in valid_categories:
                raise HTTPException(422, "Choose a valid Nexora category")
            item["category"] = body.category
            item["category_confidence"] = 1.0
            item["suggested_subcategory"] = _subcategory(item)
        if body.sizes is not None:
            item["sizes"] = _uniq(body.sizes)[:30]
        if body.colors is not None:
            item["colors"] = _uniq(body.colors)[:30]
        if body.ignored is not None and not item.get("duplicate"):
            item["ignored"] = bool(body.ignored)
        if body.title is not None:
            item["title"] = body.title.strip()[:300]
        if body.description is not None:
            item["description"] = body.description.strip()[:10000]
        if body.brand is not None:
            item["brand"] = body.brand.strip()[:120]
        if body.sku is not None:
            item["sku"] = body.sku.strip()[:120]
        if body.price is not None:
            if body.price <= 0:
                raise HTTPException(422, "Price must be greater than 0")
            item["price"] = round(float(body.price), 2)
        if body.discount_price is not None:
            if body.discount_price < 0:
                raise HTTPException(422, "Discount price cannot be negative")
            item["discount_price"] = round(float(body.discount_price), 2)
        if body.image_url is not None:
            value = body.image_url.strip()
            if value:
                if not value.startswith(("http://", "https://")):
                    raise HTTPException(422, "Image URL must start with http:// or https://")
                images = list(item.get("images") or [])
                if value not in images:
                    images.insert(0, value)
                item["images"] = images[:12]
        item["missing_fields"] = _required_fields(item)
        item["ready"] = not item["missing_fields"] and not item.get("duplicate")
        break
    if not found:
        raise HTTPException(404, "Product was not found in this scan")
    summary = _summary(products)
    await db.store_import_scans.update_one({"id": scan_id, "seller_id": user["id"]}, {"$set": {"products": products, "ai_summary": summary, "updated_at": now_iso()}})
    return {"ok": True, "products": products, "ai_summary": summary}


class ChatBody(BaseModel):
    scan_id: str
    message: str = Field(min_length=1, max_length=1200)


def _find_category(message, categories):
    lower = _norm(message)
    best, best_len = None, 0
    for cat in categories:
        slug, name = cat.get("slug"), cat.get("name") or ""
        for candidate in (slug, name):
            marker = _norm(candidate)
            if marker and marker in lower and len(marker) > best_len:
                best, best_len = slug, len(marker)
    return best


def _product_text(p):
    return _norm(f"{p.get('title')} {p.get('description')} {p.get('brand')} {p.get('category')} {p.get('suggested_subcategory')}")


def _extract_command_keyword(lower):
    cleaned = lower
    for phrase in ("ignore", "remove", "bad dao", "bad deo", "exclude", "only", "keep only", "rakho", "keep", "include"):
        cleaned = cleaned.replace(phrase, " ")
    return re.sub(r"\s+", " ", cleaned).strip()


@router.post("/seller/import-store/ai/chat")
async def assistant_chat(body: ChatBody, request: Request, user: dict = Depends(seller_dep)):
    await check_rate_limit(request, action="catalogue-ai-chat", limit=60, window_seconds=3600, identity=user["id"])
    await store_importer._require_import(user)
    scan = await db.store_import_scans.find_one({"id": body.scan_id, "seller_id": user["id"]}, {"_id": 0})
    if not scan:
        raise HTTPException(404, "Import scan expired or was not found")
    if not scan.get("ai_prepared"):
        scan = await prepare_scan(body.scan_id, user["id"])
    products = scan.get("products", [])
    await ensure_import_categories()
    categories = await db.categories.find({}, {"_id": 0}).to_list(300)
    msg = body.message.strip()
    lower = _norm(msg)
    changed, action, custom_reply = 0, "summary", None

    if any(x in lower for x in ("help", "what can you do", "commands", "ki korte paro")):
        action = "help"
        custom_reply = "I can summarize the scan, show incomplete or duplicate items, keep only a category/keyword, ignore a keyword, include ready items, ignore out-of-stock products, and bulk-map products to a Nexora category. Examples: ‘only fashion’, ‘ignore hoodie’, ‘select all ready’, ‘put all panjabi under fashion’, or ‘show incomplete products’."
    elif "duplicate" in lower and any(x in lower for x in ("show", "list", "why", "koto", "how many")):
        action = "duplicates"
        dupes = [p for p in products if p.get("duplicate")]
        examples = ", ".join(p.get("title", "") for p in dupes[:5])
        custom_reply = f"I found {len(dupes)} exact/high-confidence duplicate(s)." + (f" Examples: {examples}." if examples else "") + " Similar title/price alone is no longer enough to auto-ignore a product."
    elif any(x in lower for x in ("incomplete", "missing", "needs details", "details missing")):
        action = "incomplete"
        incomplete = [p for p in products if p.get("missing_fields") and not p.get("duplicate") and not p.get("ignored")]
        examples = "; ".join(f"{p.get('title')}: {', '.join(p.get('missing_fields') or [])}" for p in incomplete[:5])
        custom_reply = f"{len(incomplete)} product(s) still need required details." + (f" {examples}." if examples else "")
    elif any(x in lower for x in ("ignore out of stock", "remove out of stock", "out of stock bad")):
        action = "ignore_out_of_stock"
        for p in products:
            if p.get("stock_known") and int(p.get("stock") or 0) <= 0 and not p.get("duplicate"):
                if not p.get("ignored"):
                    changed += 1
                p["ignored"] = True
    elif any(x in lower for x in ("select all ready", "include all ready", "keep all ready", "ready shob")):
        action = "select_ready"
        for p in products:
            if p.get("ready") and not p.get("duplicate"):
                if p.get("ignored"):
                    changed += 1
                p["ignored"] = False
    elif lower.startswith("only ") or lower.startswith("keep only ") or " shudhu " in f" {lower} ":
        action = "only_filter"
        keyword = lower.replace("keep only ", "", 1).replace("only ", "", 1).replace("shudhu", " ").strip()
        category = _find_category(keyword, categories)
        for p in products:
            match = p.get("category") == category if category else keyword in _product_text(p)
            new_ignored = (not match) or bool(p.get("duplicate"))
            if p.get("ignored") != new_ignored:
                changed += 1
            p["ignored"] = new_ignored
    elif any(lower.startswith(x) for x in ("ignore ", "remove ", "exclude ", "bad dao ", "bad deo ")):
        action = "ignore_keyword"
        keyword = _extract_command_keyword(lower)
        for p in products:
            if keyword and keyword in _product_text(p) and not p.get("duplicate"):
                if not p.get("ignored"):
                    changed += 1
                p["ignored"] = True
    elif any(lower.startswith(x) for x in ("include ", "keep ", "rakho ")):
        action = "include_keyword"
        keyword = _extract_command_keyword(lower)
        for p in products:
            if keyword and keyword in _product_text(p) and p.get("ready") and not p.get("duplicate"):
                if p.get("ignored"):
                    changed += 1
                p["ignored"] = False
    elif " under " in lower or " to category " in lower or lower.startswith("category ") or " category te " in lower:
        action = "bulk_category"
        category = _find_category(lower, categories)
        keyword = lower
        for phrase in ("put all", "move all", "set all", "category", "to", "under", "te"):
            keyword = re.sub(rf"\b{re.escape(phrase)}\b", " ", keyword)
        if category:
            for token in {_norm(category), _norm(CATEGORY_NAMES.get(category, category))}:
                keyword = keyword.replace(token, " ")
        keyword = re.sub(r"\s+", " ", keyword).strip()
        if category:
            for p in products:
                if not keyword or keyword in _product_text(p):
                    p["category"] = category
                    p["category_confidence"] = 1.0
                    p["suggested_subcategory"] = _subcategory(p)
                    p["missing_fields"] = _required_fields(p)
                    p["ready"] = not p["missing_fields"] and not p.get("duplicate")
                    changed += 1
        else:
            custom_reply = "Tell me the Nexora category name as well, for example: ‘put all panjabi under fashion’."

    summary = _summary(products)
    reply = custom_reply or f"I checked {summary['total']} candidates: {summary['ready']} ready, {summary['incomplete']} incomplete, {summary['duplicates']} exact duplicates auto-ignored, {summary['possible_duplicates']} possible duplicates left for your review, and {summary['ignored']} currently ignored."
    if action not in {"summary", "help", "duplicates", "incomplete"} and custom_reply is None:
        reply = f"Done. Updated {changed} product(s). " + reply
    if summary["incomplete"] and action not in {"incomplete", "help"}:
        reply += " Incomplete products stay blocked until their required fields are completed."

    history = list(scan.get("assistant_chat") or [])[-58:]
    history.extend([
        {"id": new_id("chat_"), "role": "user", "message": msg, "created_at": now_iso()},
        {"id": new_id("chat_"), "role": "assistant", "message": reply, "created_at": now_iso()},
    ])
    await db.store_import_scans.update_one({"id": body.scan_id, "seller_id": user["id"]}, {"$set": {"products": products, "ai_summary": summary, "assistant_chat": history[-60:], "updated_at": now_iso()}})
    return {"reply": reply, "products": products, "ai_summary": summary, "assistant_chat": history[-60:]}


class AIImportBody(BaseModel):
    scan_id: str
    product_keys: List[str] = []
    publish: bool = False


def _variants_for(item):
    variants = []
    if item.get("sizes"):
        variants.append({"name": "Size", "options": _uniq(item["sizes"])})
    if item.get("colors"):
        variants.append({"name": "Color", "options": _uniq(item["colors"])})
    return variants


async def _is_duplicate_at_write(shop_id, item):
    checks = []
    if item.get("source_key"):
        checks.append({"source_import.source_key": item.get("source_key")})
    if item.get("source_url"):
        checks.append({"source_import.source_url": item.get("source_url")})
    if item.get("sku"):
        checks.append({"sku": {"$regex": f"^{re.escape(str(item.get('sku')))}$", "$options": "i"}})
    if not checks:
        return None
    return await db.products.find_one({"shop_id": shop_id, "$or": checks}, {"_id": 0, "id": 1, "title": 1})


@router.post("/seller/import-store/ai/import")
async def ai_import(body: AIImportBody, request: Request, user: dict = Depends(seller_dep)):
    await check_rate_limit(request, action="catalogue-import-write", limit=12, window_seconds=3600, identity=user["id"])
    _, shop, _, plan_id = await store_importer._require_import(user)
    scan = await db.store_import_scans.find_one({"id": body.scan_id, "seller_id": user["id"]}, {"_id": 0})
    if not scan:
        raise HTTPException(404, "Import scan expired or was not found")
    if not scan.get("ai_prepared"):
        scan = await prepare_scan(body.scan_id, user["id"])
    selected = set(body.product_keys or [])
    candidates = [p for p in scan.get("products", []) if (not selected or p.get("source_key") in selected) and p.get("ready") and not p.get("ignored") and not p.get("duplicate")]
    if not candidates:
        raise HTTPException(422, "No ready products selected. Complete missing details first.")

    ent = get_entitlements(plan_id)
    current_count = await db.products.count_documents({"shop_id": shop["id"]})
    imported, skipped, imported_keys = 0, [], []
    for item in candidates:
        duplicate = await _is_duplicate_at_write(shop["id"], item)
        if duplicate:
            skipped.append({"title": item.get("title"), "reason": "exact source/SKU duplicate"})
            continue
        if ent["max_products"] != -1 and current_count >= ent["max_products"]:
            skipped.append({"title": item.get("title"), "reason": "plan product limit reached"})
            continue

        variants = _variants_for(item)
        title_text = _norm(item.get("title"))
        product_type = "general"
        if item.get("category") == "fashion":
            product_type = "footwear" if any(x in title_text for x in FOOTWEAR_WORDS) else "apparel"
        doc = {
            "id": new_id("prod_"),
            "product_type": product_type,
            "variant_inventory": [],
            "fulfillment": {"lead_time_days": 1, "available_dates": [], "unavailable_dates": [], "allow_message": True, "max_message_length": 80, "allergens": ""},
            "title": item["title"], "description": item.get("description") or "", "category": item["category"], "brand": item.get("brand") or "", "sku": item.get("sku") or "",
            "price": item["price"], "discount_price": item.get("discount_price"), "images": item.get("images") or [], "variants": variants, "attributes": [], "stock": int(item.get("stock") or 0),
            "status": "published" if body.publish else "draft", "tags": [x for x in [item.get("category"), item.get("suggested_subcategory")] if x],
            "specs": {"import_category_confidence": item.get("category_confidence"), "import_source": scan.get("platform"), "suggested_subcategory": item.get("suggested_subcategory") or ""},
            "is_featured": False, "shop_id": shop["id"], "shop_name": shop["name"], "shop_slug": shop["slug"], "seller_id": user["id"], "rating": 0.0, "review_count": 0, "sold_count": 0,
            "source_import": {"source_key": item.get("source_key"), "platform": item.get("platform"), "external_id": item.get("external_id"), "source_url": item.get("source_url"), "stock_known": bool(item.get("stock_known")), "last_synced_at": now_iso()},
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        validate_product(doc)
        await db.products.insert_one(dict(doc))
        imported += 1
        imported_keys.append(item.get("source_key"))
        current_count += 1

    if imported and scan.get("platform") != "facebook-page":
        await db.store_import_profiles.update_one(
            {"seller_id": user["id"]},
            {"$set": {"shop_id": shop["id"], "website_url": scan.get("website_url"), "platform": scan.get("platform"), "updated_at": now_iso()}, "$setOnInsert": {"id": new_id("import_"), "seller_id": user["id"], "auto_sync": False, "sync_fields": ["title", "description", "price", "discount_price", "images", "stock", "sku"], "sync_new_products": True, "interval_hours": 6, "created_at": now_iso()}},
            upsert=True,
        )

    if imported_keys:
        imported_set = set(imported_keys)
        scan_products = scan.get("products", [])
        for item in scan_products:
            if item.get("source_key") in imported_set:
                item["ready"] = False
                item["ignored"] = True
                item["duplicate"] = True
                item["duplicate_reason"] = "Added to your Nexora shop"
        summary = _summary(scan_products)
        await db.store_import_scans.update_one(
            {"id": body.scan_id, "seller_id": user["id"]},
            {"$set": {"products": scan_products, "ai_summary": summary, "updated_at": now_iso()}},
        )
    else:
        scan_products = scan.get("products", [])
        summary = _summary(scan_products)

    return {
        "ok": True,
        "imported": imported,
        "imported_keys": imported_keys,
        "products": scan_products,
        "ai_summary": summary,
        "skipped": skipped,
        "message": f"Added {imported} product(s) to your shop. {len(skipped)} duplicate or plan-limited item(s) skipped.",
    }
