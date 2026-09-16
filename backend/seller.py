from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Response, Query, Header
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Literal
from datetime import datetime, timezone, timedelta
import uuid
import os
import re
from product_rules import validate_product

from db import db, NO_ID, new_id, now_iso
from security import get_current_user, require_role
from entitlements import get_plan, get_entitlements, PLANS, PLAN_ORDER, PLAN_FEATURES
from storage import put_object, get_object, APP_NAME, MIME_TYPES
from admin import get_dashboard_theme

router = APIRouter()

seller_dep = require_role("seller")


def _order_total_bdt(order):
    """Read both legacy BDT totals and the current integer-paisa order format."""
    value = order.get("total")
    if value is None:
        value = float(order.get("total_paisa") or 0) / 100
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _order_datetime(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _counts_as_sale(order):
    return str(order.get("status") or "").lower() not in {
        "cancelled", "canceled", "refunded", "failed", "rejected"
    }


async def _seller_context(user: dict):
    profile = await db.seller_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    shop = await db.shops.find_one({"seller_id": user["id"]}, {"_id": 0})
    sub = await db.subscriptions.find_one({"seller_id": user["id"]}, {"_id": 0})
    plan_id = sub["plan"] if sub and sub.get("status") in ("active", "active_dev") else "free"
    return profile, shop, sub, plan_id


@router.get("/seller/me")
async def seller_me(user: dict = Depends(seller_dep)):
    profile, shop, sub, plan_id = await _seller_context(user)
    if shop:
        shop["product_count"] = await db.products.count_documents({"shop_id": shop["id"]})
    return {
        "profile": profile,
        "shop": shop,
        "subscription": sub,
        "plan": get_plan(plan_id),
        "entitlements": get_entitlements(plan_id),
        "dashboard_theme": await get_dashboard_theme(plan_id),
    }


class OnboardingBody(BaseModel):
    business_name: str
    phone: Optional[str] = None
    category: str
    plan: str
    shop_name: str
    shop_slug: str
    description: Optional[str] = ""
    courier_provider: Literal["steadfast", "pathao"] = "steadfast"
    pickup_contact_name: str = Field(min_length=2, max_length=80)
    pickup_phone: str = Field(min_length=10, max_length=20)
    pickup_address: str = Field(min_length=8, max_length=300)
    pickup_area: str = Field(min_length=2, max_length=100)
    pickup_city: str = Field(min_length=2, max_length=100)
    pickup_postal_code: Optional[str] = Field(default="", max_length=20)


@router.post("/seller/onboarding")
async def seller_onboarding(body: OnboardingBody, user: dict = Depends(seller_dep)):
    plan_id = body.plan if body.plan in PLANS else "free"
    slug = body.shop_slug.lower().strip().replace(" ", "-")
    existing = await db.shops.find_one({"slug": slug})
    if existing and existing.get("seller_id") != user["id"]:
        raise HTTPException(status_code=400, detail="This shop URL is already taken")

    cat = await db.categories.find_one({"slug": body.category}, {"_id": 0})
    theme_preset = cat["theme"] if cat else "fashion_editorial"

    await db.seller_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {
            "business_name": body.business_name,
            "phone": body.phone,
            "category": body.category,
            "delivery_setup": {
                "provider": body.courier_provider,
                "pickup_contact_name": body.pickup_contact_name.strip(),
                "pickup_phone": body.pickup_phone.strip(),
                "pickup_address": body.pickup_address.strip(),
                "pickup_area": body.pickup_area.strip(),
                "pickup_city": body.pickup_city.strip(),
                "pickup_postal_code": (body.pickup_postal_code or "").strip(),
                "connection_status": "pending_connection",
            },
            "onboarding_complete": True,
            "updated_at": now_iso(),
        }, "$setOnInsert": {"id": new_id("sp_"), "user_id": user["id"], "created_at": now_iso()}},
        upsert=True,
    )

    shop = await db.shops.find_one({"seller_id": user["id"]}, {"_id": 0})
    if not shop:
        shop = {
            "id": new_id("shop_"),
            "seller_id": user["id"],
            "name": body.shop_name,
            "slug": slug,
            "category": body.category,
            "theme_preset": theme_preset,
            "description": body.description or "",
            "logo": None,
            "banner": None,
            "hero_image": None,
            "hero_heading": f"Welcome to {body.shop_name}",
            "hero_subheading": body.description or "Discover our curated collection",
            "hero_cta": "Shop Now",
            "accent_color": None,
            "secondary_color": None,
            "typography_preset": "default",
            "featured_product_ids": [],
            "collections": [],
            "sections": ["hero", "featured", "products", "about"],
            "about": "",
            "social_links": {},
            "contact": {"phone": body.phone or "", "email": user["email"]},
            "policies": {"shipping": "", "returns": ""},
            "rating": 0.0,
            "is_featured": False,
            "status": "draft",
            "created_at": now_iso(),
        }
        await db.shops.insert_one(dict(shop))

    subscription_status = "active" if plan_id == "free" else ("active_dev" if os.getenv("ALLOW_DEV_SUBSCRIPTIONS", "false").lower() == "true" else "pending")
    await db.subscriptions.update_one(
        {"seller_id": user["id"]},
        {"$set": {"plan": plan_id, "status": subscription_status, "updated_at": now_iso()},
         "$setOnInsert": {"id": new_id("sub_"), "seller_id": user["id"], "started_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True, "shop_slug": slug}


class ShopUpdate(BaseModel):
    name: Optional[str] = None
    logo: Optional[str] = None
    banner: Optional[str] = None
    hero_image: Optional[str] = None
    hero_heading: Optional[str] = None
    hero_subheading: Optional[str] = None
    hero_cta: Optional[str] = None
    description: Optional[str] = None
    accent_color: Optional[str] = None
    secondary_color: Optional[str] = None
    typography_preset: Optional[str] = None
    theme_preset: Optional[str] = None
    featured_product_ids: Optional[List[str]] = None
    collections: Optional[list] = None
    sections: Optional[List[str]] = None
    about: Optional[str] = None
    social_links: Optional[dict] = None
    contact: Optional[dict] = None
    policies: Optional[dict] = None


class DeliverySetupUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: Literal["steadfast", "pathao"]
    pickup_contact_name: str = Field(min_length=2, max_length=80)
    pickup_phone: str = Field(min_length=10, max_length=20)
    pickup_address: str = Field(min_length=8, max_length=300)
    pickup_area: str = Field(min_length=2, max_length=100)
    pickup_city: str = Field(min_length=2, max_length=100)
    pickup_postal_code: Optional[str] = Field(default="", max_length=20)


@router.put("/seller/delivery-setup")
async def update_delivery_setup(body: DeliverySetupUpdate, user: dict = Depends(seller_dep)):
    delivery_setup = {
        **body.model_dump(),
        "pickup_contact_name": body.pickup_contact_name.strip(),
        "pickup_phone": body.pickup_phone.strip(),
        "pickup_address": body.pickup_address.strip(),
        "pickup_area": body.pickup_area.strip(),
        "pickup_city": body.pickup_city.strip(),
        "pickup_postal_code": (body.pickup_postal_code or "").strip(),
        "connection_status": "pending_connection",
        "updated_at": now_iso(),
    }
    result = await db.seller_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {"delivery_setup": delivery_setup, "updated_at": now_iso()}},
    )
    if not result.matched_count:
        raise HTTPException(400, "Complete seller onboarding first")
    return delivery_setup


@router.put("/seller/shop")
async def update_shop(body: ShopUpdate, user: dict = Depends(seller_dep)):
    _, shop, _, plan_id = await _seller_context(user)
    if not shop:
        raise HTTPException(status_code=400, detail="Complete onboarding first")
    ent = get_entitlements(plan_id)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    for key in ("accent_color", "secondary_color"):
        if updates.get(key) and not re.fullmatch(r"#[0-9a-fA-F]{6}", updates[key]):
            raise HTTPException(422, "Use a six-digit hex color")
    for url in (updates.get("social_links") or {}).values():
        if url and not str(url).startswith(("https://", "http://")):
            raise HTTPException(422, "Social links must use HTTP or HTTPS")
    if "typography_preset" in updates and updates["typography_preset"] not in ("default", "serif", "sans"):
        raise HTTPException(422, "Choose a supported font")
    if "theme_preset" in updates:
        supported = ["fashion_editorial", "cake_bakery_food", "electronics_technical", "beauty_elegant", "furniture_home", "grocery_fresh", "jewellery_luxury", "sports_energetic", "books_editorial"]
        if updates["theme_preset"] not in supported:
            raise HTTPException(422, "Choose a supported theme")
    # Central entitlement gating
    if not ent["theme_switching"]:
        updates.pop("theme_preset", None)
    if not ent.get("layout_customization"):
        updates.pop("typography_preset", None)
        updates.pop("sections", None)
    if not ent["custom_accent_color"]:
        updates.pop("accent_color", None)
        updates.pop("secondary_color", None)
    if "collections" in updates and ent["collections_limit"] != -1:
        updates["collections"] = updates["collections"][: ent["collections_limit"]]
    if "sections" in updates and ent["sections_limit"] != -1:
        updates["sections"] = updates["sections"][: ent["sections_limit"]]

    updates["updated_at"] = now_iso()
    await db.shops.update_one({"id": shop["id"]}, {"$set": updates})
    return await db.shops.find_one({"id": shop["id"]}, {"_id": 0})


@router.post("/seller/shop/publish")
async def publish_shop(user: dict = Depends(seller_dep)):
    _, shop, _, _ = await _seller_context(user)
    if not shop:
        raise HTTPException(status_code=400, detail="No shop found")
    await db.shops.update_one({"id": shop["id"]}, {"$set": {"status": "published"}})
    return {"status": "published"}


@router.post("/seller/shop/unpublish")
async def unpublish_shop(user: dict = Depends(seller_dep)):
    _, shop, _, _ = await _seller_context(user)
    await db.shops.update_one({"id": shop["id"]}, {"$set": {"status": "draft"}})
    return {"status": "draft"}


# ---------- Products ----------
class VariantStock(BaseModel):
    options: dict[str, str]
    stock: int = Field(default=0, ge=0, strict=True)
    price: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    sku: str = ""

class Fulfillment(BaseModel):
    lead_time_days: int = Field(default=1, ge=0, le=365)
    available_dates: List[str] = []
    unavailable_dates: List[str] = []
    allow_message: bool = True
    max_message_length: int = Field(default=80, ge=0, le=300)
    allergens: str = ""

class ProductBody(BaseModel):
    product_type: str = "general"
    variant_inventory: List[VariantStock] = Field(default_factory=list, max_length=200)
    fulfillment: Fulfillment = Field(default_factory=Fulfillment)
    title: str
    description: Optional[str] = ""
    category: Optional[str] = None
    brand: Optional[str] = ""
    sku: Optional[str] = ""
    price: float = Field(ge=0, allow_inf_nan=False)
    discount_price: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    images: List[str] = []
    variants: list = []
    attributes: list = []
    stock: int = Field(default=0, ge=0, strict=True)
    status: str = "draft"
    tags: List[str] = []
    specs: dict = {}
    is_featured: bool = False


@router.get("/seller/products")
async def seller_products(user: dict = Depends(seller_dep), search: Optional[str] = None, status: Optional[str] = None, sort: str = "newest"):
    _, shop, _, _ = await _seller_context(user)
    if not shop:
        return {"items": [], "total": 0}
    q = {"shop_id": shop["id"]}
    if search:
        q["title"] = {"$regex": search, "$options": "i"}
    if status:
        q["status"] = status
    sort_map = {"newest": [("created_at", -1)], "price_low": [("price", 1)], "price_high": [("price", -1)], "stock_low": [("stock", 1)]}
    items = await db.products.find(q, {"_id": 0}).sort(sort_map.get(sort, [("created_at", -1)])).to_list(1000)
    return {"items": items, "total": len(items)}


@router.post("/seller/products")
async def create_product(body: ProductBody, user: dict = Depends(seller_dep)):
    profile, shop, sub, plan_id = await _seller_context(user)
    if not shop:
        raise HTTPException(status_code=400, detail="Complete onboarding first")
    ent = get_entitlements(plan_id)
    count = await db.products.count_documents({"shop_id": shop["id"]})
    if ent["max_products"] != -1 and count >= ent["max_products"]:
        raise HTTPException(status_code=403, detail=f"Your {plan_id.upper()} plan allows up to {ent['max_products']} products. Upgrade to add more.")
    p = validate_product(body.model_dump())
    p.update({
        "id": new_id("prod_"),
        "shop_id": shop["id"],
        "shop_name": shop["name"],
        "shop_slug": shop["slug"],
        "seller_id": user["id"],
        "category": body.category or shop["category"],
        "rating": 0.0,
        "review_count": 0,
        "sold_count": 0,
        "created_at": now_iso(),
    })
    await db.products.insert_one(dict(p))
    return p


@router.put("/seller/products/{product_id}")
async def update_product(product_id: str, body: ProductBody, user: dict = Depends(seller_dep)):
    p = await db.products.find_one({"id": product_id, "seller_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    updates = body.model_dump(exclude_unset=True)
    validate_product({**p, **updates})
    if body.category:
        updates["category"] = body.category
    await db.products.update_one({"id": product_id}, {"$set": updates})
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@router.delete("/seller/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(seller_dep)):
    res = await db.products.delete_one({"id": product_id, "seller_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"ok": True}


class BulkBody(BaseModel):
    product_ids: List[str]
    action: str  # publish | unpublish | delete


class SellerOrderAction(BaseModel):
    action: Literal["confirm", "packed", "ready_for_pickup"]


@router.post("/seller/orders/{order_id}/action")
async def seller_order_action(order_id: str, body: SellerOrderAction, user: dict = Depends(seller_dep)):
    profile, shop, _, _ = await _seller_context(user)
    if not shop:
        raise HTTPException(400, "Complete onboarding first")
    order = await db.orders.find_one({"id": order_id, "seller_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    transitions = {"confirm": ({"pending"}, "confirmed"), "packed": ({"confirmed", "processing"}, "packed"), "ready_for_pickup": ({"packed"}, "ready_for_pickup")}
    allowed, next_status = transitions[body.action]
    if order.get("status") == next_status:
        return order
    if order.get("status") not in allowed:
        raise HTTPException(409, f"Order cannot move from {order.get('status')} to {next_status}")
    update = {"status": next_status, "updated_at": now_iso()}
    if body.action == "ready_for_pickup":
        delivery = (profile or {}).get("delivery_setup") or {}
        required = ("provider", "pickup_contact_name", "pickup_phone", "pickup_address", "pickup_area", "pickup_city")
        if any(not str(delivery.get(key, "")).strip() for key in required):
            raise HTTPException(409, "Complete courier and pickup settings before requesting pickup")
        shipment = await db.shipments.find_one({"order_id": order_id}, {"_id": 0})
        if not shipment:
            shipment = {"id": new_id("ship_"), "order_id": order_id, "seller_id": user["id"], "provider": delivery["provider"], "pickup": {key: delivery.get(key) for key in required if key != "provider"}, "status": "awaiting_courier_connection", "tracking_code": None, "timeline": [{"status": "ready_for_pickup", "label": "Seller marked parcel ready", "at": now_iso()}], "created_at": now_iso(), "updated_at": now_iso()}
            await db.shipments.insert_one(dict(shipment))
        update.update({"shipment_id": shipment["id"], "courier_status": shipment["status"]})
    await db.orders.update_one({"id": order_id, "seller_id": user["id"]}, {"$set": update})
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


@router.post("/seller/products/bulk")
async def bulk_action(body: BulkBody, user: dict = Depends(seller_dep)):
    _, shop, _, plan_id = await _seller_context(user)
    if not get_entitlements(plan_id)["bulk_management"]:
        raise HTTPException(status_code=403, detail="Bulk management requires the GROW plan or higher")
    q = {"id": {"$in": body.product_ids}, "seller_id": user["id"]}
    if body.action == "delete":
        await db.products.delete_many(q)
    elif body.action in ("publish", "unpublish"):
        await db.products.update_many(q, {"$set": {"status": "published" if body.action == "publish" else "draft"}})
    return {"ok": True}


# ---------- Dashboard data ----------
@router.get("/seller/overview")
async def seller_overview(user: dict = Depends(seller_dep)):
    _, shop, sub, plan_id = await _seller_context(user)
    if not shop:
        return {"metrics": {}, "recent_orders": [], "low_stock": [], "shop": None}
    total_products = await db.products.count_documents({"shop_id": shop["id"]})
    published = await db.products.count_documents({"shop_id": shop["id"], "status": "published"})
    low_stock = await db.products.find({"shop_id": shop["id"], "stock": {"$lte": 5}}, {"_id": 0}).limit(6).to_list(6)
    orders = await db.orders.find({"shop_id": shop["id"]}, {"_id": 0}).sort([("created_at", -1)]).limit(6).to_list(6)
    all_orders = await db.orders.find({"shop_id": shop["id"]}, {"_id": 0}).to_list(50000)
    sale_orders = [order for order in all_orders if _counts_as_sale(order)]
    revenue = round(sum(_order_total_bdt(order) for order in sale_orders), 2)
    reviews_count = await db.reviews.count_documents({"shop_id": shop["id"]})
    return {
        "metrics": {
            "revenue": revenue,
            "orders": len(sale_orders),
            "products": total_products,
            "published": published,
            "reviews": reviews_count,
            "rating": shop.get("rating", 0),
        },
        "recent_orders": orders,
        "low_stock": low_stock,
        "shop": shop,
        "plan": get_plan(plan_id),
    }


@router.get("/seller/analytics")
async def seller_analytics(
    period: str = Query("weekly", pattern="^(daily|weekly|monthly|yearly)$"),
    user: dict = Depends(seller_dep),
):
    """Return real seller order and revenue buckets for the requested period."""
    _, shop, _, _ = await _seller_context(user)
    if not shop:
        return {"period": period, "series": [], "summary": {"revenue": 0, "orders": 0, "items_sold": 0, "average_order": 0}}

    now = datetime.now(timezone.utc)
    if period == "daily":
        starts = [now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=i) for i in range(23, -1, -1)]
        key = lambda dt: dt.strftime("%Y-%m-%d-%H")
        label = lambda dt: dt.strftime("%H:%M")
        cutoff = starts[0]
    elif period == "weekly":
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        starts = [today - timedelta(days=i) for i in range(6, -1, -1)]
        key = lambda dt: dt.strftime("%Y-%m-%d")
        label = lambda dt: dt.strftime("%a")
        cutoff = starts[0]
    elif period == "monthly":
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        starts = [today - timedelta(days=i) for i in range(29, -1, -1)]
        key = lambda dt: dt.strftime("%Y-%m-%d")
        label = lambda dt: dt.strftime("%d %b")
        cutoff = starts[0]
    else:
        first_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        starts = []
        year, month = first_this_month.year, first_this_month.month
        for offset in range(11, -1, -1):
            absolute = year * 12 + (month - 1) - offset
            starts.append(datetime(absolute // 12, absolute % 12 + 1, 1, tzinfo=timezone.utc))
        key = lambda dt: dt.strftime("%Y-%m")
        label = lambda dt: dt.strftime("%b")
        cutoff = starts[0]

    rows = await db.orders.find(
        {"shop_id": shop["id"], "created_at": {"$gte": cutoff.isoformat()}},
        {"_id": 0, "total": 1, "total_paisa": 1, "status": 1, "created_at": 1, "items": 1},
    ).to_list(50000)
    buckets = {key(start): {"label": label(start), "revenue": 0.0, "orders": 0, "items_sold": 0} for start in starts}
    for order in rows:
        if not _counts_as_sale(order):
            continue
        created = _order_datetime(order.get("created_at"))
        if not created or created < cutoff:
            continue
        bucket = buckets.get(key(created.astimezone(timezone.utc)))
        if not bucket:
            continue
        bucket["revenue"] += _order_total_bdt(order)
        bucket["orders"] += 1
        bucket["items_sold"] += sum(int(item.get("qty") or 0) for item in order.get("items") or [])

    series = []
    for start in starts:
        point = buckets[key(start)]
        point["revenue"] = round(point["revenue"], 2)
        series.append(point)
    revenue = round(sum(point["revenue"] for point in series), 2)
    orders = sum(point["orders"] for point in series)
    return {
        "period": period,
        "series": series,
        "summary": {
            "revenue": revenue,
            "orders": orders,
            "items_sold": sum(point["items_sold"] for point in series),
            "average_order": round(revenue / orders, 2) if orders else 0,
        },
    }


@router.get("/seller/orders")
async def seller_orders(user: dict = Depends(seller_dep)):
    _, shop, _, _ = await _seller_context(user)
    if not shop:
        return []
    orders = await db.orders.find({"shop_id": shop["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(200)
    shipment_ids = [order.get("shipment_id") for order in orders if order.get("shipment_id")]
    shipments = await db.shipments.find({"id": {"$in": shipment_ids}}, {"_id": 0}).to_list(200) if shipment_ids else []
    by_id = {shipment["id"]: shipment for shipment in shipments}
    for order in orders:
        order["shipment"] = by_id.get(order.get("shipment_id"))
    return orders


@router.get("/seller/reviews")
async def seller_reviews(user: dict = Depends(seller_dep)):
    _, shop, _, _ = await _seller_context(user)
    if not shop:
        return []
    return await db.reviews.find({"shop_id": shop["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(200)


@router.get("/seller/customers")
async def seller_customers(user: dict = Depends(seller_dep)):
    _, shop, _, _ = await _seller_context(user)
    if not shop:
        return []
    orders = await db.orders.find({"shop_id": shop["id"]}, {"_id": 0}).to_list(1000)
    agg = {}
    for o in orders:
        key = o.get("customer_email", "guest")
        agg.setdefault(key, {"name": o.get("customer_name", "Customer"), "email": key, "orders": 0, "spent": 0})
        agg[key]["orders"] += 1
        agg[key]["spent"] += o.get("total", 0)
    return list(agg.values())


# ---------- Subscription ----------
@router.get("/subscriptions/plans")
async def subscription_plans():
    return {"plans": [PLANS[p] for p in PLAN_ORDER], "features": PLAN_FEATURES}


class PlanChange(BaseModel):
    plan: str


@router.post("/seller/subscription")
async def change_subscription(body: PlanChange, user: dict = Depends(seller_dep)):
    if body.plan not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    subscription_status = "active" if body.plan == "free" else ("active_dev" if os.getenv("ALLOW_DEV_SUBSCRIPTIONS", "false").lower() == "true" else "pending")
    await db.subscriptions.update_one(
        {"seller_id": user["id"]},
        {"$set": {"plan": body.plan, "status": subscription_status, "updated_at": now_iso()},
         "$setOnInsert": {"id": new_id("sub_"), "seller_id": user["id"], "started_at": now_iso()}},
        upsert=True,
    )
    return {"plan": get_plan(body.plan), "entitlements": get_entitlements(body.plan)}


# ---------- Upload ----------
@router.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = (file.filename or "file.bin").split(".")[-1].lower()
    if ext not in MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4().hex}.{ext}"
    data = await file.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, "Images must be at most 8 MB")
    result = put_object(path, data, MIME_TYPES.get(ext, "application/octet-stream"))
    await db.files.insert_one({
        "id": new_id("file_"),
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": MIME_TYPES.get(ext),
        "owner": user["id"],
        "is_deleted": False,
        "created_at": now_iso(),
    })
    return {"path": result["path"], "url": f"/api/files/{result['path']}"}


@router.get("/files/{path:path}")
async def serve_file(path: str):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, content_type = get_object(path)
    return Response(content=data, media_type=record.get("content_type") or content_type)
