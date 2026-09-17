"""PRO-only external store import + scheduled sync.

Supports Shopify public products.json, WooCommerce Store API, and generic
schema.org Product JSON-LD. The seller must confirm ownership/permission.
"""
import asyncio
import hashlib
import html
import ipaddress
import json
import logging
import re
import socket
from datetime import datetime, timedelta, timezone
from typing import List
from urllib.parse import urljoin, urlparse, urlunparse
from xml.etree import ElementTree

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from db import db, new_id, now_iso
from entitlements import get_entitlements
from product_rules import validate_product
from rate_limit import check_rate_limit
from security import require_role
import seller

router = APIRouter()
seller_dep = require_role("seller")
logger = logging.getLogger("nexora.store_importer")

USER_AGENT = "NexoraStoreImporter/1.0"
MAX_BYTES = 5 * 1024 * 1024
MAX_GENERIC_PAGES = 30
SCAN_TTL_MINUTES = 30
SYNC_FIELDS = {"title", "description", "price", "discount_price", "images", "stock", "sku"}
_sync_task = None


def _origin(raw: str) -> str:
    value = raw.strip()
    if not value.startswith(("http://", "https://")):
        value = "https://" + value
    p = urlparse(value)
    if not p.hostname:
        raise HTTPException(422, "Enter a valid website URL")
    netloc = p.hostname.lower()
    if p.port:
        netloc += f":{p.port}"
    return urlunparse((p.scheme.lower(), netloc, "", "", "", ""))


def _assert_public(url: str):
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


def _fetch_text(url: str):
    current = url
    for _ in range(4):
        _assert_public(current)
        try:
            r = requests.get(
                current,
                headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/json,application/xml,text/xml,*/*"},
                timeout=12,
                stream=True,
                allow_redirects=False,
            )
        except requests.RequestException as exc:
            raise HTTPException(422, f"Could not reach website: {exc.__class__.__name__}")

        if r.status_code in (301, 302, 303, 307, 308):
            location = r.headers.get("Location")
            r.close()
            if not location:
                break
            current = urljoin(current, location)
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


def _fetch_json(url: str):
    text, final_url = _fetch_text(url)
    try:
        return json.loads(text), final_url
    except json.JSONDecodeError:
        return None, final_url


def _number(value):
    if value in (None, ""):
        return None
    try:
        return round(float(str(value).replace(",", "").strip()), 2)
    except Exception:
        return None


def _text(value):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", str(value)))).strip()


def _key(platform: str, external_id: str, source_url: str):
    return hashlib.sha256(f"{platform}|{external_id}|{source_url}".encode()).hexdigest()[:32]


def _product(platform, external_id, source_url, title, price, *, description="", discount_price=None,
             images=None, sku="", stock=0, stock_known=False, category="", brand=""):
    regular, discount = _number(price), _number(discount_price)
    if regular is None and discount is not None:
        regular, discount = discount, None
    if regular is None:
        return None
    if discount is not None and discount > regular:
        discount = None
    clean_title = _text(title)
    if not clean_title:
        return None
    safe_images = []
    for image in images or []:
        if isinstance(image, dict):
            image = image.get("src") or image.get("url")
        if isinstance(image, str) and image.startswith(("http://", "https://")):
            safe_images.append(image)
    try:
        stock = max(0, int(stock or 0))
    except Exception:
        stock = 0
    return {
        "source_key": _key(platform, str(external_id or ""), source_url),
        "platform": platform,
        "external_id": str(external_id or ""),
        "source_url": source_url,
        "title": clean_title[:300],
        "description": _text(description)[:10000],
        "price": regular,
        "discount_price": discount,
        "images": safe_images[:12],
        "sku": str(sku or "")[:120],
        "stock": stock,
        "stock_known": bool(stock_known),
        "category": _text(category)[:120],
        "brand": _text(brand)[:120],
    }


def _shopify(origin: str):
    data, _ = _fetch_json(f"{origin}/products.json?limit=250")
    if not isinstance(data, dict) or not isinstance(data.get("products"), list):
        return []
    out = []
    for p in data["products"]:
        variants = p.get("variants") or []
        first = variants[0] if variants else {}
        current, compare = _number(first.get("price")), _number(first.get("compare_at_price"))
        regular = compare if compare not in (None, 0) else current
        discount = current if current is not None and regular is not None and current < regular else None
        stocks = [v.get("inventory_quantity") for v in variants if isinstance(v.get("inventory_quantity"), int)]
        handle = p.get("handle") or ""
        item = _product(
            "shopify", p.get("id"), f"{origin}/products/{handle}" if handle else origin,
            p.get("title"), regular,
            description=p.get("body_html") or "", discount_price=discount,
            images=[x.get("src") for x in p.get("images", []) if x.get("src")],
            sku=first.get("sku") or "", stock=sum(max(0, x) for x in stocks), stock_known=bool(stocks),
            category=p.get("product_type") or "", brand=p.get("vendor") or "",
        )
        if item:
            out.append(item)
    return out


def _woo_price(prices, key):
    if not isinstance(prices, dict) or prices.get(key) is None:
        return None
    try:
        return float(prices[key]) / (10 ** int(prices.get("currency_minor_unit", 2)))
    except Exception:
        return None


def _woocommerce(origin: str):
    data, _ = _fetch_json(f"{origin}/wp-json/wc/store/v1/products?per_page=100&page=1")
    if not isinstance(data, list):
        return []
    out = []
    for p in data:
        prices = p.get("prices") or {}
        regular, current = _woo_price(prices, "regular_price"), _woo_price(prices, "price")
        regular = regular if regular is not None else current
        discount = current if current is not None and regular is not None and current < regular else None
        categories = p.get("categories") or []
        category = categories[0].get("name", "") if categories and isinstance(categories[0], dict) else ""
        item = _product(
            "woocommerce", p.get("id"), p.get("permalink") or origin, p.get("name"), regular,
            description=p.get("description") or p.get("short_description") or "", discount_price=discount,
            images=[x.get("src") for x in p.get("images", []) if isinstance(x, dict) and x.get("src")],
            sku=p.get("sku") or "", stock=0, stock_known=False, category=category,
        )
        if item:
            out.append(item)
    return out


def _flatten(value):
    if isinstance(value, list):
        out = []
        for x in value:
            out.extend(_flatten(x))
        return out
    if isinstance(value, dict) and isinstance(value.get("@graph"), list):
        return _flatten(value["@graph"])
    return [value] if isinstance(value, dict) else []


def _jsonld_products(page_html: str, page_url: str):
    blocks = re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', page_html, re.I | re.S)
    out = []
    for raw in blocks:
        try:
            data = json.loads(html.unescape(raw.strip()))
        except Exception:
            continue
        for obj in _flatten(data):
            typ = obj.get("@type")
            is_product = "product" in [str(x).lower() for x in typ] if isinstance(typ, list) else str(typ).lower() == "product"
            if not is_product:
                continue
            offers = obj.get("offers") or {}
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            if not isinstance(offers, dict):
                offers = {}
            imgs = obj.get("image") or []
            if isinstance(imgs, str):
                imgs = [imgs]
            elif isinstance(imgs, dict):
                imgs = [imgs.get("url") or imgs.get("contentUrl")]
            imgs = [urljoin(page_url, x) for x in imgs if isinstance(x, str)]
            brand = obj.get("brand") or ""
            if isinstance(brand, dict):
                brand = brand.get("name") or ""
            source_url = obj.get("url") or page_url
            source_url = urljoin(page_url, source_url) if isinstance(source_url, str) else page_url
            availability = str(offers.get("availability") or "").lower()
            item = _product(
                "generic", obj.get("sku") or obj.get("productID") or obj.get("@id") or source_url,
                source_url, obj.get("name"), offers.get("price") or offers.get("lowPrice") or offers.get("highPrice"),
                description=obj.get("description") or "", images=imgs, sku=obj.get("sku") or "",
                stock=0 if "outofstock" in availability else (1 if availability else 0), stock_known=bool(availability),
                category=obj.get("category") or "", brand=brand,
            )
            if item:
                out.append(item)
    return out


def _sitemap_pages(origin: str):
    pages = []
    for candidate in (f"{origin}/sitemap.xml", f"{origin}/sitemap_index.xml"):
        try:
            text, _ = _fetch_text(candidate)
            root = ElementTree.fromstring(text)
        except Exception:
            continue
        locs = [n.text.strip() for n in root.iter() if n.tag.lower().endswith("loc") and n.text]
        child_maps = [u for u in locs if u.lower().endswith(".xml") or "sitemap" in u.lower()]
        pages.extend(u for u in locs if u not in child_maps)
        for child_url in child_maps[:8]:
            try:
                child_text, _ = _fetch_text(child_url)
                child = ElementTree.fromstring(child_text)
                pages.extend(n.text.strip() for n in child.iter() if n.tag.lower().endswith("loc") and n.text)
            except Exception:
                pass
        if pages:
            break
    preferred = [u for u in pages if re.search(r"/(product|products|shop|item)/", u, re.I)]
    return (preferred or pages)[:MAX_GENERIC_PAGES]


def _generic(origin: str):
    urls = [origin] + _sitemap_pages(origin)
    out, seen = [], set()
    for url in urls[: MAX_GENERIC_PAGES + 1]:
        try:
            text, final_url = _fetch_text(url)
        except HTTPException:
            continue
        for item in _jsonld_products(text, final_url):
            if item["source_key"] not in seen:
                seen.add(item["source_key"])
                out.append(item)
    return out


def scan_store_sync(raw_url: str):
    origin = _origin(raw_url)
    _assert_public(origin)
    try:
        products = _shopify(origin)
        if products:
            return {"website_url": origin, "platform": "shopify", "products": products}
    except HTTPException:
        pass
    try:
        products = _woocommerce(origin)
        if products:
            return {"website_url": origin, "platform": "woocommerce", "products": products}
    except HTTPException:
        pass
    return {"website_url": origin, "platform": "generic", "products": _generic(origin)}


async def _require_import(user: dict):
    profile, shop, sub, plan_id = await seller._seller_context(user)
    if not shop:
        raise HTTPException(400, "Complete seller onboarding first")
    if not get_entitlements(plan_id).get("store_import"):
        raise HTTPException(403, "Import Existing Store requires the PRO plan")
    return profile, shop, sub, plan_id


class ScanBody(BaseModel):
    url: str = Field(min_length=4, max_length=500)
    confirm_rights: bool = False


@router.post("/seller/import-store/scan/legacy", include_in_schema=False)
async def scan_store(body: ScanBody, user: dict = Depends(seller_dep)):
    await _require_import(user)
    if not body.confirm_rights:
        raise HTTPException(422, "Confirm that you own this website or have permission to import its catalogue")
    result = await asyncio.to_thread(scan_store_sync, body.url)
    scan_id = new_id("scan_")
    await db.store_import_scans.insert_one({
        "id": scan_id, "seller_id": user["id"], **result, "created_at": now_iso(),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=SCAN_TTL_MINUTES),
    })
    unknown = sum(1 for p in result["products"] if not p.get("stock_known"))
    warnings = []
    if unknown:
        warnings.append(f"{unknown} product(s) did not expose exact stock; they will import with stock 0 until reviewed or synchronized from a source that exposes inventory.")
    if not result["products"]:
        warnings.append("No public importable products were found. Generic sites should expose schema.org Product JSON-LD.")
    return {"scan_id": scan_id, **result, "count": len(result["products"]), "warnings": warnings}


class ImportBody(BaseModel):
    scan_id: str
    product_keys: List[str] = []
    publish: bool = False


def _document(item: dict, shop: dict, seller_id: str, publish=False):
    doc = {
        "product_type": "general", "variant_inventory": [],
        "fulfillment": {"lead_time_days": 1, "available_dates": [], "unavailable_dates": [], "allow_message": True, "max_message_length": 80, "allergens": ""},
        "title": item["title"], "description": item.get("description") or "",
        "category": item.get("category") or shop.get("category"), "brand": item.get("brand") or "", "sku": item.get("sku") or "",
        "price": item["price"], "discount_price": item.get("discount_price"), "images": item.get("images") or [],
        "variants": [], "attributes": [], "stock": int(item.get("stock") or 0), "status": "published" if publish else "draft",
        "tags": [], "specs": {}, "is_featured": False,
        "shop_id": shop["id"], "shop_name": shop["name"], "shop_slug": shop["slug"], "seller_id": seller_id,
        "rating": 0.0, "review_count": 0, "sold_count": 0,
        "source_import": {"source_key": item["source_key"], "platform": item["platform"], "external_id": item.get("external_id"),
                          "source_url": item["source_url"], "stock_known": bool(item.get("stock_known")), "last_synced_at": now_iso()},
    }
    validate_product(doc)
    return doc


@router.post("/seller/import-store/import")
async def import_products(body: ImportBody, request: Request, user: dict = Depends(seller_dep)):
    await check_rate_limit(request, action="catalogue-import-write", limit=12, window_seconds=3600, identity=user["id"])
    _, shop, _, plan_id = await _require_import(user)
    scan = await db.store_import_scans.find_one({"id": body.scan_id, "seller_id": user["id"]}, {"_id": 0})
    if not scan:
        raise HTTPException(404, "Import scan expired or was not found")
    selected = set(body.product_keys or [])
    items = [p for p in scan.get("products", []) if not selected or p.get("source_key") in selected]
    if not items:
        raise HTTPException(422, "Select at least one product")

    ent = get_entitlements(plan_id)
    count = await db.products.count_documents({"shop_id": shop["id"]})
    imported = updated = 0
    skipped = []
    for item in items:
        existing = await db.products.find_one({"shop_id": shop["id"], "source_import.source_key": item["source_key"]}, {"_id": 0, "id": 1})
        if not existing and ent["max_products"] != -1 and count >= ent["max_products"]:
            skipped.append({"title": item["title"], "reason": "plan product limit reached"})
            continue
        doc = _document(item, shop, user["id"], body.publish)
        doc["updated_at"] = now_iso()
        if existing:
            for field in ("rating", "review_count", "sold_count", "status"):
                doc.pop(field, None)
            await db.products.update_one({"id": existing["id"]}, {"$set": doc})
            updated += 1
        else:
            doc.update({"id": new_id("prod_"), "created_at": now_iso()})
            await db.products.insert_one(dict(doc))
            imported += 1
            count += 1

    await db.store_import_profiles.update_one(
        {"seller_id": user["id"]},
        {"$set": {"shop_id": shop["id"], "website_url": scan["website_url"], "platform": scan["platform"], "updated_at": now_iso()},
         "$setOnInsert": {"id": new_id("import_"), "seller_id": user["id"], "auto_sync": False,
                           "sync_fields": ["title", "description", "price", "discount_price", "images", "stock", "sku"],
                           "sync_new_products": True, "interval_hours": 6, "created_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True, "imported": imported, "updated": updated, "skipped": skipped,
            "message": f"Imported {imported} new product(s) and updated {updated} existing product(s)."}


@router.get("/seller/import-store/profile")
async def import_profile(user: dict = Depends(seller_dep)):
    await _require_import(user)
    profile = await db.store_import_profiles.find_one({"seller_id": user["id"]}, {"_id": 0})
    return profile or {"website_url": None, "platform": None, "auto_sync": False,
                       "sync_fields": ["title", "description", "price", "discount_price", "images", "stock", "sku"],
                       "sync_new_products": True, "interval_hours": 6, "last_sync_at": None}


class SyncSettingsBody(BaseModel):
    enabled: bool
    sync_fields: List[str] = []
    sync_new_products: bool = True
    interval_hours: int = Field(default=6, ge=6, le=24)


@router.put("/seller/import-store/auto-sync")
async def auto_sync(body: SyncSettingsBody, user: dict = Depends(seller_dep)):
    await _require_import(user)
    profile = await db.store_import_profiles.find_one({"seller_id": user["id"]}, {"_id": 0})
    if not profile or not profile.get("website_url"):
        raise HTTPException(400, "Import a store first")
    fields = [f for f in body.sync_fields if f in SYNC_FIELDS] or ["price", "discount_price", "stock"]
    await db.store_import_profiles.update_one({"seller_id": user["id"]}, {"$set": {
        "auto_sync": body.enabled, "sync_fields": fields, "sync_new_products": body.sync_new_products,
        "interval_hours": body.interval_hours, "updated_at": now_iso(),
    }})
    return {"ok": True}


async def _sync_profile(profile: dict):
    seller_id = profile["seller_id"]
    sub = await db.subscriptions.find_one({"seller_id": seller_id}, {"_id": 0})
    plan_id = sub.get("plan") if sub and sub.get("status") in ("active", "active_dev") else "start"
    if not get_entitlements(plan_id).get("store_import"):
        await db.store_import_profiles.update_one({"seller_id": seller_id}, {"$set": {"auto_sync": False, "last_sync_error": "PRO plan required"}})
        return {"ok": False, "reason": "PRO plan required"}
    shop = await db.shops.find_one({"seller_id": seller_id}, {"_id": 0})
    if not shop:
        return {"ok": False, "reason": "shop missing"}
    try:
        scan = await asyncio.to_thread(scan_store_sync, profile["website_url"])
    except Exception as exc:
        await db.store_import_profiles.update_one({"seller_id": seller_id}, {"$set": {"last_sync_error": str(exc), "last_sync_attempt_at": now_iso()}})
        return {"ok": False, "reason": str(exc)}

    fields = [f for f in profile.get("sync_fields", []) if f in SYNC_FIELDS] or ["price", "discount_price", "stock"]
    updated = created = 0
    for item in scan["products"]:
        existing = await db.products.find_one({"shop_id": shop["id"], "source_import.source_key": item["source_key"]}, {"_id": 0})
        if existing:
            changes = {}
            for field in fields:
                if field == "stock" and not item.get("stock_known"):
                    continue
                changes[field] = item.get(field)
            changes.update({"source_import.last_synced_at": now_iso(), "source_import.source_url": item["source_url"],
                            "source_import.stock_known": bool(item.get("stock_known")), "updated_at": now_iso()})
            candidate = dict(existing)
            candidate.update({k: v for k, v in changes.items() if "." not in k})
            if candidate.get("discount_price") is not None and candidate["discount_price"] > candidate.get("price", 0):
                changes["discount_price"] = None
                candidate["discount_price"] = None
            validate_product(candidate)
            await db.products.update_one({"id": existing["id"]}, {"$set": changes})
            updated += 1
        elif profile.get("sync_new_products", True):
            doc = _document(item, shop, seller_id, False)
            doc.update({"id": new_id("prod_"), "created_at": now_iso(), "updated_at": now_iso()})
            await db.products.insert_one(dict(doc))
            created += 1

    await db.store_import_profiles.update_one({"seller_id": seller_id}, {"$set": {
        "platform": scan["platform"], "last_sync_at": now_iso(), "last_sync_attempt_at": now_iso(),
        "last_sync_error": None, "updated_at": now_iso(),
    }})
    return {"ok": True, "updated": updated, "created": created}


@router.post("/seller/import-store/sync-now")
async def sync_now(request: Request, user: dict = Depends(seller_dep)):
    await check_rate_limit(request, action="catalogue-sync", limit=6, window_seconds=3600, identity=user["id"])
    await _require_import(user)
    profile = await db.store_import_profiles.find_one({"seller_id": user["id"]}, {"_id": 0})
    if not profile or not profile.get("website_url"):
        raise HTTPException(400, "Import a store first")
    result = await _sync_profile(profile)
    if not result.get("ok"):
        raise HTTPException(422, result.get("reason", "Sync failed"))
    return result


async def ensure_indexes():
    await db.store_import_scans.create_index("expires_at", expireAfterSeconds=0)
    await db.store_import_profiles.create_index("seller_id", unique=True)
    await db.products.create_index([("shop_id", 1), ("source_import.source_key", 1)], sparse=True)


def _due(profile: dict):
    if not profile.get("last_sync_at"):
        return True
    try:
        last = datetime.fromisoformat(str(profile["last_sync_at"]).replace("Z", "+00:00"))
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
    except Exception:
        return True
    return datetime.now(timezone.utc) >= last + timedelta(hours=max(6, min(24, int(profile.get("interval_hours") or 6))))


async def _loop():
    while True:
        try:
            profiles = await db.store_import_profiles.find({"auto_sync": True}, {"_id": 0}).to_list(1000)
            for profile in profiles:
                if _due(profile):
                    try:
                        await _sync_profile(profile)
                    except Exception:
                        logger.exception("Automatic seller store sync failed")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Store sync worker iteration failed")
        await asyncio.sleep(300)


def start_sync_worker():
    global _sync_task
    if _sync_task is None or _sync_task.done():
        _sync_task = asyncio.create_task(_loop())


async def stop_sync_worker():
    global _sync_task
    if _sync_task and not _sync_task.done():
        _sync_task.cancel()
        try:
            await _sync_task
        except asyncio.CancelledError:
            pass
    _sync_task = None
