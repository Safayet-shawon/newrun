from datetime import datetime, timezone, timedelta
from typing import Literal, Optional
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from db import db, new_id, now_iso
from security import require_role
from entitlements import PLAN_ORDER
from admin import audit, get_platform_settings
from subscription_tokens import consume_pending_token

router = APIRouter()
admin_dep = require_role("admin")
PLAN_IDS = tuple(PLAN_ORDER)


def utcnow():
    return datetime.now(timezone.utc)


def parse_iso(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def slugify(value: str):
    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")


@router.get("/admin/nexora/seller-subscriptions")
async def seller_subscriptions(user=Depends(admin_dep)):
    sellers = await db.users.find({"role": "seller"}, {"_id": 0, "password_hash": 0}).sort([("created_at", -1)]).to_list(2000)
    rows, now = [], utcnow()
    for seller in sellers:
        sid = seller["id"]
        shop = await db.shops.find_one({"seller_id": sid}, {"_id": 0})
        sub = await db.subscriptions.find_one({"seller_id": sid}, {"_id": 0})
        profile = await db.seller_profiles.find_one({"user_id": sid}, {"_id": 0})
        expiry = parse_iso((sub or {}).get("expires_at"))
        days = (expiry.date() - now.date()).days if expiry else None
        status = (sub or {}).get("status", "no_subscription")
        if expiry and expiry <= now and status in ("active", "active_dev"):
            status = "expired"
        rows.append({
            "seller_id": sid, "seller_name": seller.get("name"), "email": seller.get("email"),
            "phone": (profile or {}).get("phone"), "seller_status": seller.get("status", "active"),
            "shop_id": (shop or {}).get("id"), "shop_name": (shop or {}).get("name"),
            "shop_slug": (shop or {}).get("slug"), "shop_status": (shop or {}).get("status"),
            "plan": (sub or {}).get("plan"), "subscription_status": status,
            "amount_paid": (sub or {}).get("amount_paid", (sub or {}).get("payable_bdt", 0)),
            "payment_method": (sub or {}).get("payment_method"), "transaction_id": (sub or {}).get("transaction_id"),
            "started_at": (sub or {}).get("started_at"), "expires_at": (sub or {}).get("expires_at"),
            "days_remaining": days, "subscription_source": (sub or {}).get("subscription_source"),
        })
    rows.sort(key=lambda r: 999999 if r["days_remaining"] is None else r["days_remaining"])
    return rows


class CategoryBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=80)
    slug: Optional[str] = Field(default=None, max_length=100)
    image_url: Optional[str] = Field(default=None, max_length=800)
    theme: Optional[str] = Field(default="fashion_editorial", max_length=80)
    icon: Optional[str] = Field(default="tag", max_length=50)
    is_active: bool = True


@router.get("/admin/nexora/categories")
async def list_categories(user=Depends(admin_dep)):
    items = await db.categories.find({}, {"_id": 0}).sort([("sort_order", 1), ("name", 1)]).to_list(500)
    for i, item in enumerate(items):
        item.setdefault("id", item.get("slug")); item.setdefault("sort_order", i + 1); item.setdefault("is_active", True)
        item["product_count"] = await db.products.count_documents({"category": item.get("slug")})
    return items


@router.post("/admin/nexora/categories")
async def create_category(body: CategoryBody, user=Depends(admin_dep)):
    slug = slugify(body.slug or body.name)
    if not slug: raise HTTPException(422, "Invalid category name")
    if await db.categories.find_one({"slug": slug}): raise HTTPException(409, "Category slug already exists")
    last = await db.categories.find({}, {"_id": 0, "sort_order": 1}).sort([("sort_order", -1)]).limit(1).to_list(1)
    item = {"id": new_id("cat_"), "name": body.name.strip(), "slug": slug, "image_url": body.image_url,
            "theme": body.theme or "fashion_editorial", "icon": body.icon or "tag",
            "sort_order": (last[0].get("sort_order", 0) if last else 0) + 1, "is_active": body.is_active,
            "created_at": now_iso(), "updated_at": now_iso()}
    await db.categories.insert_one(dict(item)); await audit(user, "admin.category.created", item["id"], {"slug": slug})
    return item


@router.put("/admin/nexora/categories/{category_id}")
async def update_category(category_id: str, body: CategoryBody, user=Depends(admin_dep)):
    current = await db.categories.find_one({"$or": [{"id": category_id}, {"slug": category_id}]}, {"_id": 0})
    if not current: raise HTTPException(404, "Category not found")
    new_slug = slugify(body.slug or body.name)
    duplicate = await db.categories.find_one({"slug": new_slug}, {"_id": 0})
    if duplicate and new_slug != current.get("slug"): raise HTTPException(409, "Category slug already exists")
    updates = {"name": body.name.strip(), "slug": new_slug, "image_url": body.image_url,
               "theme": body.theme or current.get("theme", "fashion_editorial"), "icon": body.icon or current.get("icon", "tag"),
               "is_active": body.is_active, "updated_at": now_iso()}
    await db.categories.update_one({"slug": current["slug"]}, {"$set": updates})
    if new_slug != current["slug"]:
        await db.products.update_many({"category": current["slug"]}, {"$set": {"category": new_slug}})
        await db.shops.update_many({"category": current["slug"]}, {"$set": {"category": new_slug}})
    await audit(user, "admin.category.updated", current.get("id", current["slug"]), updates)
    return await db.categories.find_one({"slug": new_slug}, {"_id": 0})


@router.patch("/admin/nexora/categories/{category_id}/status")
async def category_status(category_id: str, body: dict, user=Depends(admin_dep)):
    current = await db.categories.find_one({"$or": [{"id": category_id}, {"slug": category_id}]}, {"_id": 0})
    if not current: raise HTTPException(404, "Category not found")
    active = bool(body.get("is_active"))
    await db.categories.update_one({"slug": current["slug"]}, {"$set": {"is_active": active, "updated_at": now_iso()}})
    await audit(user, "admin.category.status", current.get("id", current["slug"]), {"is_active": active})
    return {"ok": True, "is_active": active}


@router.delete("/admin/nexora/categories/{category_id}")
async def delete_category(category_id: str, user=Depends(admin_dep)):
    current = await db.categories.find_one({"$or": [{"id": category_id}, {"slug": category_id}]}, {"_id": 0})
    if not current: raise HTTPException(404, "Category not found")
    products = await db.products.count_documents({"category": current["slug"]}); shops = await db.shops.count_documents({"category": current["slug"]})
    if products or shops: raise HTTPException(409, f"Category is used by {products} products and {shops} shops. Hide it instead.")
    await db.categories.delete_one({"slug": current["slug"]}); await audit(user, "admin.category.deleted", current.get("id", current["slug"]), {})
    return {"ok": True}


@router.get("/admin/nexora/featured-shops")
async def featured_shops(user=Depends(admin_dep)):
    shops = await db.shops.find({}, {"_id": 0}).sort([("rating", -1)]).to_list(2000); out = []
    for shop in shops:
        reviews = await db.reviews.count_documents({"shop_id": shop["id"]})
        sub = await db.subscriptions.find_one({"seller_id": shop["seller_id"]}, {"_id": 0})
        out.append({**shop, "shop_name": shop.get("name"), "total_reviews": reviews, "plan": (sub or {}).get("plan"),
                    "auto_qualifies": float(shop.get("rating", 0) or 0) >= 4.7 and reviews >= 10,
                    "is_featured": bool(shop.get("is_featured"))})
    return out


@router.patch("/admin/nexora/featured-shops/{shop_id}")
async def toggle_featured(shop_id: str, body: dict, user=Depends(admin_dep)):
    featured = bool(body.get("is_featured")); result = await db.shops.update_one({"id": shop_id}, {"$set": {"is_featured": featured, "updated_at": now_iso()}})
    if not result.matched_count: raise HTTPException(404, "Shop not found")
    await audit(user, "admin.shop.featured", shop_id, {"is_featured": featured}); return {"ok": True, "is_featured": featured}


@router.get("/admin/nexora/revenue")
async def revenue(user=Depends(admin_dep)):
    settings = await get_platform_settings(); rate = float(settings.get("commission_percent", 0))
    subs = await db.subscriptions.find({}, {"_id": 0}).to_list(10000); distribution = []
    for plan in PLAN_IDS:
        rows = [s for s in subs if s.get("plan") == plan and s.get("status") in ("active", "active_dev", "expired")]
        distribution.append({"plan": plan, "shop_count": len(rows), "total_revenue": round(sum(float(s.get("amount_paid", s.get("payable_bdt", 0)) or 0) for s in rows), 2)})
    sub_revenue = sum(x["total_revenue"] for x in distribution); paying = sum(x["shop_count"] for x in distribution)
    orders = await db.orders.find({"payment_status": "paid"}, {"_id": 0, "total": 1, "total_paisa": 1}).to_list(10000)
    volume = sum(float(o.get("total", o.get("total_paisa", 0) / 100)) for o in orders)
    return {"total_subscription_revenue": round(sub_revenue, 2), "total_paying_shops": paying,
            "avg_revenue_per_shop": round(sub_revenue / paying, 2) if paying else 0, "paid_order_volume": round(volume, 2),
            "commission_percent": rate, "estimated_commission": round(volume * rate / 100, 2), "distribution": distribution}


class RejectBody(BaseModel):
    reason: str = Field(min_length=2, max_length=500)


@router.get("/admin/nexora/pending")
async def pending_confirmations(user=Depends(admin_dep)):
    subs = await db.subscriptions.find({"status": {"$in": ["pending", "pending_payment", "rejected"]}}, {"_id": 0}).sort([("started_at", 1)]).to_list(2000); rows = []
    for sub in subs:
        sid = sub["seller_id"]; seller = await db.users.find_one({"id": sid}, {"_id": 0, "password_hash": 0}); shop = await db.shops.find_one({"seller_id": sid}, {"_id": 0}); profile = await db.seller_profiles.find_one({"user_id": sid}, {"_id": 0})
        rows.append({"id": sub.get("id"), "seller_id": sid, "shop_id": (shop or {}).get("id"), "shop_name": (shop or {}).get("name", "Untitled shop"),
                     "owner_name": (seller or {}).get("name"), "phone": (profile or {}).get("phone"), "email": (seller or {}).get("email"),
                     "plan": sub.get("plan"), "amount_paid": sub.get("amount_paid", sub.get("payable_bdt", 0)), "payment_method": sub.get("payment_method"),
                     "transaction_id": sub.get("transaction_id"), "status": sub.get("status"), "submitted_at": sub.get("started_at") or sub.get("created_at"), "rejected_reason": sub.get("rejected_reason")})
    return rows


@router.patch("/admin/nexora/pending/{subscription_id}/confirm")
async def confirm_pending(subscription_id: str, user=Depends(admin_dep)):
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub: raise HTTPException(404, "Pending subscription not found")
    shop = await db.shops.find_one({"seller_id": sub["seller_id"]}, {"_id": 0})
    if sub.get("pending_token_id"): await consume_pending_token(sub, (shop or {}).get("id"))
    now = utcnow(); expires = parse_iso(sub.get("expires_at")) or now + timedelta(days=30)
    await db.subscriptions.update_one({"id": subscription_id}, {"$set": {"status": "active", "amount_paid": sub.get("payable_bdt", sub.get("amount_paid", 0)), "current_period_started_at": now.isoformat(), "expires_at": expires.isoformat(), "reviewed_at": now_iso(), "reviewed_by": user["id"], "updated_at": now_iso()}, "$unset": {"pending_token_id": "", "pending_token_code": ""}})
    await db.shops.update_one({"seller_id": sub["seller_id"]}, {"$set": {"status": "published", "updated_at": now_iso()}})
    await audit(user, "admin.subscription.confirmed", subscription_id, {"seller_id": sub["seller_id"]}); return {"ok": True, "status": "active", "expires_at": expires.isoformat()}


@router.patch("/admin/nexora/pending/{subscription_id}/reject")
async def reject_pending(subscription_id: str, body: RejectBody, user=Depends(admin_dep)):
    sub = await db.subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    if not sub: raise HTTPException(404, "Pending subscription not found")
    await db.subscriptions.update_one({"id": subscription_id}, {"$set": {"status": "rejected", "rejected_reason": body.reason.strip(), "reviewed_at": now_iso(), "reviewed_by": user["id"], "updated_at": now_iso()}})
    await audit(user, "admin.subscription.rejected", subscription_id, {"reason": body.reason.strip()}); return {"ok": True, "status": "rejected"}


class ManualSubscriptionBody(BaseModel):
    shop_id: str; plan: Literal["start", "grow", "pro"]; amount_paid: float = Field(ge=0)
    payment_method: str = Field(default="cash", min_length=2, max_length=40); transaction_id: Optional[str] = Field(default=None, max_length=120)
    started_at: str; expires_at: str


@router.get("/admin/nexora/shops")
async def shops_for_subscription(user=Depends(admin_dep)):
    shops = await db.shops.find({}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "seller_id": 1}).sort([("name", 1)]).to_list(3000)
    for shop in shops:
        sub = await db.subscriptions.find_one({"seller_id": shop["seller_id"]}, {"_id": 0}); shop["plan"] = (sub or {}).get("plan")
    return shops


@router.post("/admin/nexora/subscriptions")
async def add_subscription(body: ManualSubscriptionBody, user=Depends(admin_dep)):
    shop = await db.shops.find_one({"id": body.shop_id}, {"_id": 0})
    if not shop: raise HTTPException(404, "Shop not found")
    start, expiry = parse_iso(body.started_at), parse_iso(body.expires_at)
    if not start or not expiry or expiry <= start: raise HTTPException(422, "Use valid subscription dates")
    existing = await db.subscriptions.find_one({"seller_id": shop["seller_id"]}, {"_id": 0}); sub_id = (existing or {}).get("id") or new_id("sub_")
    data = {"id": sub_id, "seller_id": shop["seller_id"], "plan": body.plan, "status": "active", "amount_paid": float(body.amount_paid),
            "original_price_bdt": float(body.amount_paid), "discount_bdt": 0, "payable_bdt": float(body.amount_paid), "payment_method": body.payment_method,
            "transaction_id": body.transaction_id or None, "started_at": start.isoformat(), "current_period_started_at": start.isoformat(), "expires_at": expiry.isoformat(),
            "subscription_source": "manual_admin", "updated_at": now_iso(), "updated_by": user["id"]}
    await db.subscriptions.update_one({"seller_id": shop["seller_id"]}, {"$set": data, "$setOnInsert": {"created_at": now_iso()}}, upsert=True)
    await db.shops.update_one({"id": shop["id"]}, {"$set": {"status": "published", "updated_at": now_iso()}})
    await audit(user, "admin.subscription.manual_added", sub_id, {"shop_id": shop["id"], "plan": body.plan, "amount_paid": body.amount_paid})
    return {"ok": True, "subscription": data}
