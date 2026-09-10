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

DEFAULT_SITE_CONTENT = {
    "id": "homepage",
    "hero_badge": "Bangladesh's trusted multi-vendor marketplace",
    "hero_line1": "Everything you love.",
    "hero_line2": "From stores you can trust.",
    "hero_subtitle": "Great products. Genuine shops. A better everyday.",
    "featured_genders": [
        {
            "title": "MEN",
            "subtitle": "Everyday style, footwear & essentials",
            "to": "/products?category=fashion&q=men",
            "image": "https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=1100&q=88",
            "tone": "from-[#BFE8EA]/25 via-[#F7FBFB]/5 to-[#0F766E]/25",
            "accent": "bg-[#0F766E]",
        },
        {
            "title": "WOMEN",
            "subtitle": "Fashion, beauty & accessories",
            "to": "/products?category=fashion&q=women",
            "image": "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1100&q=88",
            "tone": "from-[#FFD7E1]/35 via-[#FFF7F9]/5 to-[#E35D86]/25",
            "accent": "bg-[#D94B78]",
        },
    ],
    "campaigns": [
        {
            "eyebrow": "FASHION WEEK",
            "title": "Fresh looks from independent shops",
            "text": "Discover new-season fashion, local labels and everyday essentials in one place.",
            "cta": "Shop fashion",
            "to": "/category/fashion",
            "image": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=88",
            "bg": "from-[#DFF4EC] via-[#F5FCF9] to-[#E8F1FB]",
            "is_active": True,
        },
        {
            "eyebrow": "BEAUTY DAYS",
            "title": "Glow-up picks, better prices",
            "text": "Explore skincare, makeup and beauty favourites from marketplace sellers.",
            "cta": "Explore beauty",
            "to": "/category/beauty",
            "image": "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1600&q=88",
            "bg": "from-[#FFE9EF] via-[#FFF8FA] to-[#F0E9FF]",
            "is_active": True,
        },
        {
            "eyebrow": "TECH WEEKEND",
            "title": "Popular tech, one marketplace",
            "text": "Compare electronics and accessories from different shops without losing context.",
            "cta": "Shop electronics",
            "to": "/category/electronics",
            "image": "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=1600&q=88",
            "bg": "from-[#DCEBFA] via-[#F5F9FD] to-[#E9F7F1]",
            "is_active": True,
        },
        {
            "eyebrow": "DISCOVER SHOPS",
            "title": "New sellers worth following",
            "text": "Find hidden gems, local brands and new independent stores across Nexora.",
            "cta": "Browse shops",
            "to": "/shops",
            "image": "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=1600&q=88",
            "bg": "from-[#FFF0D8] via-[#FFFAF2] to-[#E7F4ED]",
            "is_active": True,
        },
    ],
}


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


class FeaturedGenderBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=40)
    subtitle: str = Field(default="", max_length=160)
    to: str = Field(default="/products", max_length=500)
    image: str = Field(default="", max_length=1200)
    tone: str = Field(default="from-[#EAF2FB] to-[#E8F7F0]", max_length=200)
    accent: str = Field(default="bg-[#0F766E]", max_length=100)


class CampaignBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    eyebrow: str = Field(default="OFFER", max_length=60)
    title: str = Field(min_length=1, max_length=140)
    text: str = Field(default="", max_length=300)
    cta: str = Field(default="Shop now", max_length=60)
    to: str = Field(default="/products", max_length=500)
    image: str = Field(default="", max_length=1200)
    bg: str = Field(default="from-[#EAF2FB] via-white to-[#E8F7F0]", max_length=200)
    is_active: bool = True


class SiteContentBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    hero_badge: str = Field(default="", max_length=120)
    hero_line1: str = Field(min_length=1, max_length=100)
    hero_line2: str = Field(min_length=1, max_length=100)
    hero_subtitle: str = Field(default="", max_length=180)
    featured_genders: list[FeaturedGenderBody] = Field(min_length=1, max_length=4)
    campaigns: list[CampaignBody] = Field(min_length=1, max_length=12)


def _site_content_merge(stored: dict | None):
    if not stored:
        return DEFAULT_SITE_CONTENT
    return {
        **DEFAULT_SITE_CONTENT,
        **stored,
        "featured_genders": stored.get("featured_genders") or DEFAULT_SITE_CONTENT["featured_genders"],
        "campaigns": stored.get("campaigns") or DEFAULT_SITE_CONTENT["campaigns"],
    }


@router.get("/site-content")
async def public_site_content():
    stored = await db.platform_content.find_one({"id": "homepage"}, {"_id": 0})
    content = _site_content_merge(stored)
    return {**content, "campaigns": [c for c in content.get("campaigns", []) if c.get("is_active", True)]}


@router.get("/admin/control/site-content")
async def admin_site_content(user=Depends(admin_dep)):
    stored = await db.platform_content.find_one({"id": "homepage"}, {"_id": 0})
    return _site_content_merge(stored)


@router.put("/admin/control/site-content")
async def update_site_content(body: SiteContentBody, user=Depends(admin_dep)):
    data = body.model_dump()
    data.update({"id": "homepage", "updated_at": now_iso(), "updated_by": user["id"]})
    await db.platform_content.update_one(
        {"id": "homepage"},
        {"$set": data, "$setOnInsert": {"created_at": now_iso()}},
        upsert=True,
    )
    await audit(user, "admin.site_content.updated", "homepage", {"campaign_count": len(data["campaigns"]), "featured_count": len(data["featured_genders"])})
    return _site_content_merge(await db.platform_content.find_one({"id": "homepage"}, {"_id": 0}))


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
    if body.status == "banned":
        ip = current.get("last_login_ip")
        role = current.get("role") if current.get("role") in {"seller", "customer"} else "all"
        if ip and ip != "unknown" and not await db.ip_bans.find_one({"ip": ip, "scope": role, "active": True}):
            ban = {
                "id": new_id("ipban_"),
                "ip": ip,
                "reason": f"Automatic IP ban with banned {role} account",
                "scope": role,
                "source_user_id": user_id,
                "active": True,
                "expires_at": None,
                "created_at": now_iso(),
                "created_by": user["id"],
            }
            await db.ip_bans.insert_one(dict(ban))
            await audit(user, "admin.ip.banned", ban["id"], {"ip": ip, "scope": role, "source_user_id": user_id, "automatic": True})
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
        await db.platform_content.create_index([("id", 1)], unique=True)
    except Exception:
        pass
