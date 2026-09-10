from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from db import db, new_id, now_iso
from security import require_role
from admin import audit
from access_security import ensure_security_indexes, get_active_ip_ban

router = APIRouter()
admin_dep = require_role("admin")

UserStatus = Literal["active", "inactive", "suspended", "banned"]
TrustBadge = Literal["none", "verified", "authentic"]
RiskFlag = Literal["none", "watch", "red"]
ProductAuthenticity = Literal["unreviewed", "authentic", "suspicious"]
ShopStatus = Literal["draft", "published", "suspended"]
ProductStatus = Literal["draft", "published", "archived"]
BanScope = Literal["all", "customer", "seller"]


class UserControlBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: UserStatus
    trust_badge: TrustBadge = "none"
    risk_flag: RiskFlag = "none"
    moderation_note: Optional[str] = Field(default=None, max_length=1000)
    picture: Optional[str] = Field(default=None, max_length=1000)


class ShopControlBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: ShopStatus
    is_verified: bool = False
    trust_badge: TrustBadge = "none"
    risk_flag: RiskFlag = "none"
    moderation_note: Optional[str] = Field(default=None, max_length=1000)
    logo: Optional[str] = Field(default=None, max_length=1000)
    hero_image: Optional[str] = Field(default=None, max_length=1000)


class ProductControlBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: ProductStatus
    authenticity_status: ProductAuthenticity = "unreviewed"
    risk_flag: RiskFlag = "none"
    moderation_note: Optional[str] = Field(default=None, max_length=1000)
    primary_image: Optional[str] = Field(default=None, max_length=1000)


class IPBanBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ip: str = Field(min_length=2, max_length=120)
    reason: str = Field(min_length=2, max_length=500)
    scope: BanScope = "all"
    expires_at: Optional[str] = None
    source_user_id: Optional[str] = None


async def _user_row(user: dict):
    uid = user["id"]
    role = user.get("role")
    row = {
        **user,
        "status": user.get("status", "active"),
        "trust_badge": user.get("trust_badge", "none"),
        "risk_flag": user.get("risk_flag", "none"),
        "login_count": int(user.get("login_count", 0) or 0),
    }
    row.pop("password_hash", None)
    ip = row.get("last_login_ip")
    row["ip_banned"] = bool(await get_active_ip_ban(ip, role)) if ip else False
    if role == "seller":
        shop = await db.shops.find_one({"seller_id": uid}, {"_id": 0})
        sub = await db.subscriptions.find_one({"seller_id": uid}, {"_id": 0})
        row["shop"] = shop
        row["subscription"] = sub
        row["order_count"] = await db.orders.count_documents({"seller_id": uid})
    elif role == "customer":
        orders = await db.orders.find({"customer_id": uid}, {"_id": 0, "total": 1, "total_paisa": 1}).to_list(5000)
        row["order_count"] = len(orders)
        row["total_spent_bdt"] = round(sum(float(o.get("total", o.get("total_paisa", 0) / 100) or 0) for o in orders), 2)
    return row


@router.get("/admin/control/overview")
async def control_overview(user=Depends(admin_dep)):
    users = await db.users.find({"role": {"$in": ["seller", "customer"]}}, {"_id": 0, "password_hash": 0}).to_list(5000)
    red = sum(1 for x in users if x.get("risk_flag") == "red")
    watch = sum(1 for x in users if x.get("risk_flag") == "watch")
    banned = sum(1 for x in users if x.get("status") == "banned")
    suspended = sum(1 for x in users if x.get("status") == "suspended")
    inactive = sum(1 for x in users if x.get("status") == "inactive")
    suspicious_products = await db.products.count_documents({"$or": [{"risk_flag": "red"}, {"authenticity_status": "suspicious"}]})
    active_ip_bans = await db.ip_bans.count_documents({"active": True})
    recent = await db.security_events.find({}, {"_id": 0}).sort([("created_at", -1)]).limit(12).to_list(12)
    return {
        "metrics": {
            "sellers": await db.users.count_documents({"role": "seller"}),
            "customers": await db.users.count_documents({"role": "customer"}),
            "published_shops": await db.shops.count_documents({"status": "published"}),
            "published_products": await db.products.count_documents({"status": "published"}),
            "red_flags": red,
            "watch_flags": watch,
            "banned_accounts": banned,
            "suspended_accounts": suspended,
            "inactive_accounts": inactive,
            "suspicious_products": suspicious_products,
            "active_ip_bans": active_ip_bans,
        },
        "recent_security_events": recent,
    }


@router.get("/admin/control/users")
async def list_users(
    role: Literal["all", "seller", "customer"] = "all",
    q: str = "",
    limit: int = Query(1000, ge=1, le=2000),
    user=Depends(admin_dep),
):
    query = {"role": {"$in": ["seller", "customer"]}} if role == "all" else {"role": role}
    docs = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort([("created_at", -1)]).limit(limit).to_list(limit)
    needle = q.strip().lower()
    if needle:
        docs = [d for d in docs if needle in " ".join(str(d.get(k, "")) for k in ("name", "email", "last_login_ip")).lower()]
    return [await _user_row(d) for d in docs]


@router.patch("/admin/control/users/{user_id}")
async def update_user_control(user_id: str, body: UserControlBody, user=Depends(admin_dep)):
    current = await db.users.find_one({"id": user_id, "role": {"$in": ["seller", "customer"]}}, {"_id": 0})
    if not current:
        raise HTTPException(404, "User not found")
    updates = {**body.model_dump(), "updated_at": now_iso(), "moderated_by": user["id"]}
    result = await db.users.update_one({"id": user_id}, {"$set": updates})
    if not result.matched_count:
        raise HTTPException(404, "User not found")
    if current.get("role") == "seller" and body.status in {"suspended", "banned"}:
        await db.shops.update_many({"seller_id": user_id}, {"$set": {"status": "suspended", "updated_at": now_iso()}})
    await audit(user, "admin.user.control_updated", user_id, {k: v for k, v in updates.items() if k != "moderation_note"})
    fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return await _user_row(fresh)


@router.patch("/admin/control/shops/{shop_id}")
async def update_shop_control(shop_id: str, body: ShopControlBody, user=Depends(admin_dep)):
    current = await db.shops.find_one({"id": shop_id}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Shop not found")
    updates = {**body.model_dump(), "updated_at": now_iso(), "moderated_by": user["id"]}
    result = await db.shops.update_one({"id": shop_id}, {"$set": updates})
    if not result.matched_count:
        raise HTTPException(404, "Shop not found")
    await audit(user, "admin.shop.control_updated", shop_id, {k: v for k, v in updates.items() if k != "moderation_note"})
    return await db.shops.find_one({"id": shop_id}, {"_id": 0})


@router.get("/admin/control/products")
async def list_products(q: str = "", limit: int = Query(1000, ge=1, le=2000), user=Depends(admin_dep)):
    items = await db.products.find({}, {"_id": 0}).sort([("created_at", -1)]).limit(limit).to_list(limit)
    needle = q.strip().lower()
    if needle:
        items = [p for p in items if needle in " ".join(str(p.get(k, "")) for k in ("title", "brand", "category", "shop_name", "sku")).lower()]
    for p in items:
        p.setdefault("authenticity_status", "unreviewed")
        p.setdefault("risk_flag", "none")
    return items


@router.patch("/admin/control/products/{product_id}")
async def update_product_control(product_id: str, body: ProductControlBody, user=Depends(admin_dep)):
    current = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Product not found")
    updates = body.model_dump(exclude={"primary_image"})
    if body.primary_image is not None:
        images = [x for x in (current.get("images") or []) if x and x != body.primary_image]
        updates["images"] = [body.primary_image] + images if body.primary_image else images
    updates.update({"updated_at": now_iso(), "moderated_by": user["id"]})
    await db.products.update_one({"id": product_id}, {"$set": updates})
    await audit(user, "admin.product.control_updated", product_id, {k: v for k, v in updates.items() if k not in {"moderation_note", "images"}})
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@router.get("/admin/control/security")
async def security_control(limit: int = Query(250, ge=1, le=1000), user=Depends(admin_dep)):
    bans = await db.ip_bans.find({}, {"_id": 0}).sort([("created_at", -1)]).limit(500).to_list(500)
    events = await db.security_events.find({}, {"_id": 0}).sort([("created_at", -1)]).limit(limit).to_list(limit)
    return {"ip_bans": bans, "events": events}


@router.post("/admin/control/ip-bans")
async def create_ip_ban(body: IPBanBody, user=Depends(admin_dep)):
    ip = body.ip.strip()
    existing = await db.ip_bans.find_one({"ip": ip, "active": True, "scope": body.scope}, {"_id": 0})
    if existing:
        return existing
    item = {
        "id": new_id("ipban_"),
        "ip": ip,
        "reason": body.reason.strip(),
        "scope": body.scope,
        "source_user_id": body.source_user_id,
        "active": True,
        "expires_at": body.expires_at,
        "created_at": now_iso(),
        "created_by": user["id"],
    }
    await db.ip_bans.insert_one(dict(item))
    await audit(user, "admin.ip.banned", item["id"], {"ip": ip, "scope": body.scope, "source_user_id": body.source_user_id})
    return item


@router.post("/admin/control/users/{user_id}/ban-ip")
async def ban_user_ip(user_id: str, body: dict, user=Depends(admin_dep)):
    target = await db.users.find_one({"id": user_id, "role": {"$in": ["seller", "customer"]}}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    ip = target.get("last_login_ip")
    if not ip or ip == "unknown":
        raise HTTPException(422, "This user has no recorded login IP yet")
    reason = str(body.get("reason") or "Blocked from owner control panel").strip()[:500]
    scope = target.get("role") if target.get("role") in {"seller", "customer"} else "all"
    item = await create_ip_ban(IPBanBody(ip=ip, reason=reason, scope=scope, source_user_id=user_id), user)
    return item


@router.patch("/admin/control/ip-bans/{ban_id}/disable")
async def disable_ip_ban(ban_id: str, user=Depends(admin_dep)):
    result = await db.ip_bans.update_one({"id": ban_id}, {"$set": {"active": False, "disabled_at": now_iso(), "disabled_by": user["id"]}})
    if not result.matched_count:
        raise HTTPException(404, "IP ban not found")
    await audit(user, "admin.ip.unbanned", ban_id, {})
    return {"ok": True}


@router.get("/admin/control/audit")
async def control_audit(limit: int = Query(300, ge=1, le=1000), user=Depends(admin_dep)):
    return await db.audit_events.find({}, {"_id": 0}).sort([("created_at", -1)]).limit(limit).to_list(limit)


async def ensure_indexes():
    await ensure_security_indexes()
    try:
        await db.users.create_index([("last_login_ip", 1)])
        await db.users.create_index([("risk_flag", 1), ("status", 1)])
        await db.products.create_index([("risk_flag", 1), ("authenticity_status", 1)])
    except Exception:
        pass
