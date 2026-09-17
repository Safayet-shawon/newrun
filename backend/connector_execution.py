"""Execution layer for Growth OS catalogue connectors.

Website/Shopify/WooCommerce reuse the hardened Store Importer. Facebook Catalog
and Daraz CSV connectors accept seller-controlled public CSV feed URLs. Private
feeds stay fail-closed until the seller supplies an accessible source.
"""
import asyncio
import csv
import io
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from db import db, new_id, now_iso
from entitlements import get_entitlements
from product_rules import validate_product
from security import require_role
import store_importer

router = APIRouter()
seller_dep = require_role("seller")
SUPPORTED = {"website", "woocommerce", "shopify", "facebook_catalog", "daraz_csv"}


def _number(value):
    if value in (None, ""):
        return None
    found = re.search(r"-?\d+(?:[,.]\d+)*", str(value))
    if not found:
        return None
    try:
        return float(found.group(0).replace(",", ""))
    except ValueError:
        return None


def _first(row, *keys):
    lowered = {str(k).strip().lower(): v for k, v in row.items()}
    for key in keys:
        value = lowered.get(key.lower())
        if value not in (None, ""):
            return value
    return ""


def _csv_products(source_type: str, source_url: str):
    text, final_url = store_importer._fetch_text(source_url)
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    rows = csv.DictReader(io.StringIO(text), dialect=dialect)
    products = []
    for index, row in enumerate(rows):
        if index >= 5000:
            break
        title = _first(row, "title", "name", "product name", "product_name")
        external = _first(row, "id", "retailer_id", "sku", "seller sku", "seller_sku", "product id") or f"row-{index}"
        price = _number(_first(row, "price", "regular price", "regular_price", "unit_price"))
        sale = _number(_first(row, "sale_price", "sale price", "specialprice", "special price", "discount_price"))
        if price is None and sale is not None:
            price, sale = sale, None
        stock_value = _first(row, "quantity", "stock", "inventory", "qty")
        try:
            stock = max(0, int(float(stock_value))) if stock_value not in (None, "") else 0
            stock_known = stock_value not in (None, "")
        except (TypeError, ValueError):
            stock, stock_known = 0, False
        images_raw = _first(row, "image_link", "image url", "image_url", "images", "image")
        images = [x.strip() for x in re.split(r"[|,]", str(images_raw or "")) if x.strip().startswith(("http://", "https://"))]
        item = store_importer._product(
            source_type,
            external,
            final_url,
            title,
            price,
            description=_first(row, "description", "body", "short_description"),
            discount_price=sale,
            images=images,
            sku=_first(row, "sku", "seller sku", "seller_sku", "retailer_id"),
            stock=stock,
            stock_known=stock_known,
            category=_first(row, "category", "product_type", "google_product_category"),
            brand=_first(row, "brand", "vendor"),
        )
        if item:
            products.append(item)
    return {"website_url": store_importer._origin(final_url), "platform": source_type, "products": products}


async def _apply_feed(seller_id: str, scan: dict):
    user = await db.users.find_one({"id": seller_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Seller account not found")
    _, shop, _, plan_id = await store_importer._require_import(user)
    ent = get_entitlements(plan_id)
    count = await db.products.count_documents({"shop_id": shop["id"]})
    created = updated = 0
    skipped = []
    for item in scan.get("products") or []:
        existing = await db.products.find_one({"shop_id": shop["id"], "source_import.source_key": item["source_key"]}, {"_id": 0})
        if not existing and ent["max_products"] != -1 and count >= ent["max_products"]:
            skipped.append({"title": item.get("title"), "reason": "plan product limit reached"})
            continue
        if existing:
            changes = {}
            for field in ("title", "description", "price", "discount_price", "images", "sku"):
                changes[field] = item.get(field)
            if item.get("stock_known"):
                changes["stock"] = item.get("stock", 0)
            changes.update({
                "source_import.last_synced_at": now_iso(), "source_import.source_url": item.get("source_url"),
                "source_import.stock_known": bool(item.get("stock_known")), "updated_at": now_iso(),
            })
            candidate = dict(existing)
            candidate.update({k: v for k, v in changes.items() if "." not in k})
            if candidate.get("discount_price") is not None and candidate.get("price") is not None and candidate["discount_price"] > candidate["price"]:
                changes["discount_price"] = None
                candidate["discount_price"] = None
            validate_product(candidate)
            await db.products.update_one({"id": existing["id"]}, {"$set": changes})
            updated += 1
        else:
            doc = store_importer._document(item, shop, seller_id, False)
            doc.update({"id": new_id("prod_"), "created_at": now_iso(), "updated_at": now_iso()})
            validate_product(doc)
            await db.products.insert_one(dict(doc))
            created += 1
            count += 1
    return {"ok": True, "created": created, "updated": updated, "skipped": skipped, "found": len(scan.get("products") or [])}


async def sync_connector_record(connector: dict):
    seller_id = connector["seller_id"]
    source_type = connector["source_type"]
    source_url = str(connector.get("source_url") or "").strip()
    if source_type not in SUPPORTED:
        return {"ok": False, "reason": "Unsupported connector type"}
    if not source_url:
        return {"ok": False, "reason": "Connector needs a source URL"}

    user = await db.users.find_one({"id": seller_id}, {"_id": 0})
    if not user:
        return {"ok": False, "reason": "Seller account missing"}
    try:
        await store_importer._require_import(user)
        if source_type in {"website", "shopify", "woocommerce"}:
            origin = store_importer._origin(source_url)
            profile = await db.store_import_profiles.find_one({"seller_id": seller_id}, {"_id": 0}) or {}
            profile.update({
                "id": profile.get("id") or new_id("import_"), "seller_id": seller_id,
                "shop_id": (await db.shops.find_one({"seller_id": seller_id}, {"_id": 0, "id": 1}))["id"],
                "website_url": origin, "platform": source_type, "auto_sync": True,
                "sync_fields": ["title", "description", "price", "discount_price", "images", "stock", "sku"],
                "sync_new_products": True,
                "interval_hours": max(6, min(24, int(connector.get("sync_frequency_hours") or 24))),
                "updated_at": now_iso(), "created_at": profile.get("created_at") or now_iso(),
            })
            await db.store_import_profiles.update_one({"seller_id": seller_id}, {"$set": profile}, upsert=True)
            result = await store_importer._sync_profile(profile)
        else:
            scan = await asyncio.to_thread(_csv_products, source_type, source_url)
            result = await _apply_feed(seller_id, scan)
        if result.get("ok"):
            await db.channel_sync_connectors.update_one(
                {"seller_id": seller_id, "source_type": source_type},
                {"$set": {"status": "connected", "last_sync_at": now_iso(), "last_sync_error": None, "updated_at": now_iso()}},
            )
        else:
            await db.channel_sync_connectors.update_one(
                {"seller_id": seller_id, "source_type": source_type},
                {"$set": {"status": "error", "last_sync_error": result.get("reason"), "updated_at": now_iso()}},
            )
        return result
    except HTTPException as exc:
        reason = str(exc.detail)
    except Exception as exc:
        reason = f"{exc.__class__.__name__}: connector sync failed"
    await db.channel_sync_connectors.update_one(
        {"seller_id": seller_id, "source_type": source_type},
        {"$set": {"status": "error", "last_sync_error": reason[:300], "updated_at": now_iso()}},
    )
    return {"ok": False, "reason": reason[:300]}


@router.post("/seller/growth/connectors/{source_type}/sync")
async def execute_connector_sync(source_type: str, user: dict = Depends(seller_dep)):
    connector = await db.channel_sync_connectors.find_one(
        {"seller_id": user["id"], "source_type": source_type, "enabled": True}, {"_id": 0}
    )
    if not connector:
        raise HTTPException(404, "Enabled connector not found")
    job = {"id": new_id("sync_"), "seller_id": user["id"], "source_type": source_type, "status": "running", "created_at": now_iso()}
    await db.channel_sync_jobs.insert_one(dict(job))
    result = await sync_connector_record(connector)
    status = "completed" if result.get("ok") else "failed"
    await db.channel_sync_jobs.update_one({"id": job["id"]}, {"$set": {"status": status, "result": result, "completed_at": now_iso()}})
    if not result.get("ok"):
        raise HTTPException(422, result.get("reason", "Connector sync failed"))
    return {**job, "status": status, "result": result}


def _due(connector: dict):
    last = connector.get("last_sync_at")
    if not last:
        return True
    try:
        parsed = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
    except Exception:
        return True
    hours = max(1, min(168, int(connector.get("sync_frequency_hours") or 24)))
    return datetime.now(timezone.utc) >= parsed + timedelta(hours=hours)


async def worker_loop():
    while True:
        try:
            connectors = await db.channel_sync_connectors.find({"enabled": True}, {"_id": 0}).to_list(1000)
            for connector in connectors:
                if not _due(connector):
                    continue
                job = {"id": new_id("sync_"), "seller_id": connector["seller_id"], "source_type": connector["source_type"], "status": "running", "created_at": now_iso(), "automatic": True}
                await db.channel_sync_jobs.insert_one(dict(job))
                result = await sync_connector_record(connector)
                await db.channel_sync_jobs.update_one({"id": job["id"]}, {"$set": {"status": "completed" if result.get("ok") else "failed", "result": result, "completed_at": now_iso()}})
        except asyncio.CancelledError:
            raise
        except Exception:
            pass
        await asyncio.sleep(300)
