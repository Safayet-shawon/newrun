"""AI-assisted catalogue preparation for Nexora PRO imports.

This layer sits between scanners and catalogue writes. It classifies products
into Nexora marketplace categories, extracts common variants, blocks incomplete
products, and automatically ignores duplicates. The chat endpoint is a
continuous catalogue assistant: it applies safe bulk commands to the current
scan while the seller reviews the import.
"""
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db, new_id, now_iso
from entitlements import get_entitlements
from product_rules import validate_product
from security import require_role
import seller
import store_importer

router = APIRouter()
seller_dep = require_role("seller")

CATEGORY_HINTS = {
    "fashion": ["shirt", "t-shirt", "tee", "panjabi", "kurti", "saree", "sari", "dress", "jeans", "trouser", "pant", "hoodie", "jacket", "blazer", "lehenga", "gown", "scarf", "dupatta", "fashion", "shoe", "sneaker", "sandal"],
    "food": ["cake", "cupcake", "brownie", "pastry", "bakery", "dessert", "cookie", "chocolate", "macaron", "cheesecake"],
    "electronics": ["earbud", "headphone", "charger", "keyboard", "mouse", "speaker", "smart watch", "smartwatch", "phone", "laptop", "camera", "power bank", "usb", "electronic"],
    "beauty": ["serum", "lipstick", "makeup", "skincare", "cream", "cleanser", "sunscreen", "toner", "foundation", "beauty", "cosmetic"],
    "furniture": ["sofa", "chair", "table", "desk", "lamp", "bookshelf", "furniture", "pillow", "vase", "home decor"],
    "grocery": ["rice", "oil", "egg", "vegetable", "fruit", "grocery", "tomato", "spinach", "banana", "food pack"],
    "jewellery": ["necklace", "earring", "bangle", "pendant", "jewellery", "jewelry", "gold", "choker", "ring"],
    "sports": ["football", "cricket", "gym", "dumbbell", "yoga", "sports", "training", "running", "jersey"],
    "books": ["book", "novel", "anthology", "poetry", "guide", "cookbook", "fiction"],
    "pets": ["cat", "dog", "pet", "litter", "scratcher", "teaser", "pet toy", "cat food", "dog food", "pet house", "collar"],
}

COLOR_WORDS = [
    "black", "white", "red", "blue", "green", "yellow", "orange", "purple", "pink", "brown",
    "grey", "gray", "navy", "beige", "maroon", "gold", "silver", "cream", "olive", "teal",
]
SIZE_RE = re.compile(r"(?<![A-Za-z0-9])(?:XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL|[2-9][0-9])(?=$|[\s,;/|)\]])", re.I)


def _norm(text):
    return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()


def _uniq(values):
    out = []
    for value in values:
        clean = str(value).strip()
        if clean and clean.lower() not in {x.lower() for x in out}:
            out.append(clean)
    return out


def _extract_sizes(text):
    return _uniq(m.group(0).upper() for m in SIZE_RE.finditer(text or ""))[:20]


def _extract_colors(text):
    lower = f" {_norm(text)} "
    found = []
    for color in COLOR_WORDS:
        if f" {color} " in lower:
            found.append(color.title())
    return _uniq(found)[:20]


def _category_score(text, slug, name):
    hay = _norm(text)
    score = 0
    if _norm(slug) in hay:
        score += 4
    if _norm(name) in hay:
        score += 4
    for hint in CATEGORY_HINTS.get(slug, []):
        if _norm(hint) in hay:
            score += 3
    return score


def _map_category(item, categories, fallback=None):
    current = str(item.get("category") or "").strip().lower()
    by_slug = {c.get("slug"): c for c in categories if c.get("slug")}
    if current in by_slug:
        return current, 1.0

    text = " ".join([
        str(item.get("title") or ""), str(item.get("description") or ""), str(item.get("brand") or ""), current,
    ])
    best_slug, best_score = None, 0
    for cat in categories:
        slug = cat.get("slug")
        if not slug:
            continue
        score = _category_score(text, slug, cat.get("name") or slug)
        if score > best_score:
            best_slug, best_score = slug, score
    if best_slug:
        return best_slug, min(0.98, 0.55 + best_score * 0.06)
    if fallback in by_slug:
        return fallback, 0.35
    return None, 0.0


def _variant_values(item):
    text = " ".join([str(item.get("title") or ""), str(item.get("description") or "")])
    sizes = list(item.get("sizes") or []) or _extract_sizes(text)
    colors = list(item.get("colors") or []) or _extract_colors(text)
    return _uniq(sizes), _uniq(colors)


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

    category = item.get("category")
    title = _norm(item.get("title"))
    apparel_or_footwear = category == "fashion" or any(x in title for x in ("shoe", "sneaker", "sandal", "shirt", "dress", "panjabi", "kurti", "saree", "jeans", "pant"))
    if apparel_or_footwear:
        if not item.get("sizes"):
            missing.append("size")
        if not item.get("colors"):
            missing.append("color")
    return missing


async def _existing_duplicate_sets(shop_id):
    docs = await db.products.find({"shop_id": shop_id}, {"_id": 0, "title": 1, "price": 1, "source_import.source_key": 1}).to_list(10000)
    titles = set()
    source_keys = set()
    for doc in docs:
        titles.add((_norm(doc.get("title")), round(float(doc.get("price") or 0), 2)))
        key = (doc.get("source_import") or {}).get("source_key")
        if key:
            source_keys.add(key)
    return titles, source_keys


async def prepare_scan(scan_id, user_id):
    scan = await db.store_import_scans.find_one({"id": scan_id, "seller_id": user_id}, {"_id": 0})
    if not scan:
        raise HTTPException(404, "Import scan expired or was not found")
    shop = await db.shops.find_one({"seller_id": user_id}, {"_id": 0})
    if not shop:
        raise HTTPException(400, "Complete seller onboarding first")
    categories = await db.categories.find({}, {"_id": 0}).to_list(200)
    existing_titles, existing_source_keys = await _existing_duplicate_sets(shop["id"])

    seen = set()
    prepared = []
    duplicate_count = 0
    for raw in scan.get("products", []):
        item = dict(raw)
        category, confidence = _map_category(item, categories, shop.get("category"))
        item["category"] = category
        item["category_confidence"] = round(confidence, 2)
        sizes, colors = _variant_values(item)
        item["sizes"], item["colors"] = sizes, colors

        fingerprint = (_norm(item.get("title")), round(float(item.get("price") or 0), 2))
        duplicate_reason = None
        if item.get("source_key") in existing_source_keys:
            duplicate_reason = "already imported from this source"
        elif fingerprint in existing_titles:
            duplicate_reason = "same title and price already exist in your Nexora shop"
        elif fingerprint in seen:
            duplicate_reason = "duplicate found in this scan"
        seen.add(fingerprint)

        missing = _required_fields(item)
        item["missing_fields"] = missing
        item["duplicate"] = bool(duplicate_reason)
        item["duplicate_reason"] = duplicate_reason
        item["ignored"] = bool(duplicate_reason)
        item["ready"] = not missing and not duplicate_reason
        item["ai_note"] = (
            f"Mapped to {category} ({int(confidence * 100)}% confidence)." if category else "Choose a Nexora category."
        )
        if duplicate_reason:
            duplicate_count += 1
        prepared.append(item)

    summary = _summary(prepared)
    summary["duplicates"] = duplicate_count
    update = {"products": prepared, "ai_prepared": True, "ai_summary": summary, "updated_at": now_iso()}
    await db.store_import_scans.update_one({"id": scan_id, "seller_id": user_id}, {"$set": update})
    return {**scan, **update, "count": len(prepared), "categories": categories}


def _summary(products):
    return {
        "total": len(products),
        "ready": sum(1 for p in products if p.get("ready") and not p.get("ignored")),
        "incomplete": sum(1 for p in products if p.get("missing_fields") and not p.get("duplicate")),
        "duplicates": sum(1 for p in products if p.get("duplicate")),
        "ignored": sum(1 for p in products if p.get("ignored")),
    }


@router.post("/seller/import-store/ai/prepare/{scan_id}")
async def prepare(scan_id: str, user: dict = Depends(seller_dep)):
    await store_importer._require_import(user)
    return await prepare_scan(scan_id, user["id"])


class ProductPatch(BaseModel):
    category: Optional[str] = None
    sizes: Optional[List[str]] = None
    colors: Optional[List[str]] = None
    ignored: Optional[bool] = None


@router.patch("/seller/import-store/ai/prepare/{scan_id}/product/{source_key}")
async def patch_product(scan_id: str, source_key: str, body: ProductPatch, user: dict = Depends(seller_dep)):
    await store_importer._require_import(user)
    scan = await db.store_import_scans.find_one({"id": scan_id, "seller_id": user["id"]}, {"_id": 0})
    if not scan:
        raise HTTPException(404, "Import scan expired or was not found")
    categories = await db.categories.find({}, {"_id": 0}).to_list(200)
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
        if body.sizes is not None:
            item["sizes"] = _uniq(body.sizes)[:20]
        if body.colors is not None:
            item["colors"] = _uniq(body.colors)[:20]
        if body.ignored is not None and not item.get("duplicate"):
            item["ignored"] = body.ignored
        item["missing_fields"] = _required_fields(item)
        item["ready"] = not item["missing_fields"] and not item.get("duplicate")
        break
    if not found:
        raise HTTPException(404, "Product was not found in this scan")
    summary = _summary(products)
    await db.store_import_scans.update_one({"id": scan_id}, {"$set": {"products": products, "ai_summary": summary, "updated_at": now_iso()}})
    return {"ok": True, "products": products, "ai_summary": summary}


class ChatBody(BaseModel):
    scan_id: str
    message: str = Field(min_length=1, max_length=1000)


def _find_category(message, categories):
    lower = _norm(message)
    for cat in categories:
        slug, name = cat.get("slug"), cat.get("name") or ""
        if slug and (_norm(slug) in lower or _norm(name) in lower):
            return slug
    return None


@router.post("/seller/import-store/ai/chat")
async def assistant_chat(body: ChatBody, user: dict = Depends(seller_dep)):
    await store_importer._require_import(user)
    scan = await db.store_import_scans.find_one({"id": body.scan_id, "seller_id": user["id"]}, {"_id": 0})
    if not scan:
        raise HTTPException(404, "Import scan expired or was not found")
    if not scan.get("ai_prepared"):
        scan = await prepare_scan(body.scan_id, user["id"])
    products = scan.get("products", [])
    categories = await db.categories.find({}, {"_id": 0}).to_list(200)
    msg = body.message.strip()
    lower = _norm(msg)
    changed = 0
    action = "summary"

    if "ignore out of stock" in lower or "remove out of stock" in lower:
        action = "ignore_out_of_stock"
        for p in products:
            if p.get("stock_known") and int(p.get("stock") or 0) <= 0 and not p.get("duplicate"):
                if not p.get("ignored"):
                    changed += 1
                p["ignored"] = True
    elif lower.startswith("ignore ") or lower.startswith("remove "):
        action = "ignore_keyword"
        keyword = lower.split(" ", 1)[1].strip()
        for p in products:
            if keyword and keyword in _norm(f"{p.get('title')} {p.get('description')}") and not p.get("duplicate"):
                if not p.get("ignored"):
                    changed += 1
                p["ignored"] = True
    elif lower.startswith("include "):
        action = "include_keyword"
        keyword = lower.split(" ", 1)[1].strip()
        for p in products:
            if keyword in _norm(f"{p.get('title')} {p.get('description')}") and p.get("ready") and not p.get("duplicate"):
                if p.get("ignored"):
                    changed += 1
                p["ignored"] = False
    elif "select all ready" in lower or "include all ready" in lower:
        action = "select_ready"
        for p in products:
            if p.get("ready") and not p.get("duplicate"):
                if p.get("ignored"):
                    changed += 1
                p["ignored"] = False
    elif lower.startswith("only "):
        action = "only_filter"
        keyword = lower[5:].strip()
        cat = _find_category(keyword, categories)
        for p in products:
            match = (p.get("category") == cat) if cat else (keyword in _norm(f"{p.get('title')} {p.get('description')}"))
            new_ignored = not match or bool(p.get("duplicate"))
            if p.get("ignored") != new_ignored:
                changed += 1
            p["ignored"] = new_ignored
    elif " under " in lower or " to category " in lower:
        action = "bulk_category"
        separator = " under " if " under " in lower else " to category "
        left, right = lower.split(separator, 1)
        category = _find_category(right, categories)
        keyword = left.replace("put all", "").replace("move all", "").replace("set all", "").strip()
        if category and keyword:
            for p in products:
                if keyword in _norm(f"{p.get('title')} {p.get('description')}"):
                    p["category"] = category
                    p["category_confidence"] = 1.0
                    p["missing_fields"] = _required_fields(p)
                    p["ready"] = not p["missing_fields"] and not p.get("duplicate")
                    changed += 1

    summary = _summary(products)
    reply = (
        f"I checked {summary['total']} candidates: {summary['ready']} ready, "
        f"{summary['incomplete']} incomplete, {summary['duplicates']} duplicates auto-ignored, "
        f"and {summary['ignored']} currently ignored."
    )
    if action != "summary":
        reply = f"Done. Updated {changed} product(s). " + reply
    if summary["incomplete"]:
        reply += " Incomplete products cannot be imported until required details are filled."

    history = list(scan.get("assistant_chat") or [])[-48:]
    history.extend([
        {"id": new_id("chat_"), "role": "user", "message": msg, "created_at": now_iso()},
        {"id": new_id("chat_"), "role": "assistant", "message": reply, "created_at": now_iso()},
    ])
    await db.store_import_scans.update_one({"id": body.scan_id}, {"$set": {"products": products, "ai_summary": summary, "assistant_chat": history, "updated_at": now_iso()}})
    return {"reply": reply, "products": products, "ai_summary": summary, "assistant_chat": history}


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


@router.post("/seller/import-store/ai/import")
async def ai_import(body: AIImportBody, user: dict = Depends(seller_dep)):
    _, shop, _, plan_id = await store_importer._require_import(user)
    scan = await db.store_import_scans.find_one({"id": body.scan_id, "seller_id": user["id"]}, {"_id": 0})
    if not scan:
        raise HTTPException(404, "Import scan expired or was not found")
    if not scan.get("ai_prepared"):
        scan = await prepare_scan(body.scan_id, user["id"])

    selected = set(body.product_keys or [])
    candidates = [p for p in scan.get("products", []) if (not selected or p.get("source_key") in selected)]
    candidates = [p for p in candidates if p.get("ready") and not p.get("ignored") and not p.get("duplicate")]
    if not candidates:
        raise HTTPException(422, "No ready products selected. Complete missing details first.")

    ent = get_entitlements(plan_id)
    current_count = await db.products.count_documents({"shop_id": shop["id"]})
    imported = 0
    skipped = []
    for item in candidates:
        duplicate = await db.products.find_one({
            "shop_id": shop["id"],
            "$or": [
                {"source_import.source_key": item.get("source_key")},
                {"title": {"$regex": f"^{re.escape(str(item.get('title') or ''))}$", "$options": "i"}, "price": item.get("price")},
            ],
        }, {"_id": 0, "id": 1})
        if duplicate:
            skipped.append({"title": item.get("title"), "reason": "duplicate"})
            continue
        if ent["max_products"] != -1 and current_count >= ent["max_products"]:
            skipped.append({"title": item.get("title"), "reason": "plan product limit reached"})
            continue

        variants = _variants_for(item)
        doc = {
            "id": new_id("prod_"),
            "product_type": "apparel" if item.get("category") == "fashion" else "general",
            "variant_inventory": [],
            "fulfillment": {"lead_time_days": 1, "available_dates": [], "unavailable_dates": [], "allow_message": True, "max_message_length": 80, "allergens": ""},
            "title": item["title"], "description": item.get("description") or "",
            "category": item["category"], "brand": item.get("brand") or "", "sku": item.get("sku") or "",
            "price": item["price"], "discount_price": item.get("discount_price"), "images": item.get("images") or [],
            "variants": variants, "attributes": [], "stock": int(item.get("stock") or 0),
            "status": "published" if body.publish else "draft", "tags": [],
            "specs": {"import_category_confidence": item.get("category_confidence"), "import_source": scan.get("platform")},
            "is_featured": False, "shop_id": shop["id"], "shop_name": shop["name"], "shop_slug": shop["slug"],
            "seller_id": user["id"], "rating": 0.0, "review_count": 0, "sold_count": 0,
            "source_import": {"source_key": item.get("source_key"), "platform": item.get("platform"), "external_id": item.get("external_id"), "source_url": item.get("source_url"), "stock_known": bool(item.get("stock_known")), "last_synced_at": now_iso()},
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        validate_product(doc)
        await db.products.insert_one(dict(doc))
        imported += 1
        current_count += 1

    if imported:
        await db.store_import_profiles.update_one(
            {"seller_id": user["id"]},
            {"$set": {"shop_id": shop["id"], "website_url": scan.get("website_url"), "platform": scan.get("platform"), "updated_at": now_iso()},
             "$setOnInsert": {"id": new_id("import_"), "seller_id": user["id"], "auto_sync": False,
                              "sync_fields": ["title", "description", "price", "discount_price", "images", "stock", "sku"],
                              "sync_new_products": True, "interval_hours": 6, "created_at": now_iso()}},
            upsert=True,
        )
    return {"ok": True, "imported": imported, "skipped": skipped, "message": f"Imported {imported} ready product(s). {len(skipped)} duplicate/limited item(s) skipped."}
