from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Response, Query, Header
from pydantic import BaseModel
from typing import Optional, List
import uuid

from db import db, NO_ID, new_id, now_iso
from security import get_current_user, require_role
from entitlements import get_plan, get_entitlements, PLANS, PLAN_ORDER, PLAN_FEATURES
from storage import put_object, get_object, APP_NAME, MIME_TYPES

router = APIRouter()

seller_dep = require_role("seller")


async def _seller_context(user: dict):
    profile = await db.seller_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    shop = await db.shops.find_one({"seller_id": user["id"]}, {"_id": 0})
    sub = await db.subscriptions.find_one({"seller_id": user["id"]}, {"_id": 0})
    plan_id = sub["plan"] if sub else "start"
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
    }


class OnboardingBody(BaseModel):
    business_name: str
    phone: Optional[str] = None
    category: str
    plan: str
    shop_name: str
    shop_slug: str
    description: Optional[str] = ""


@router.post("/seller/onboarding")
async def seller_onboarding(body: OnboardingBody, user: dict = Depends(seller_dep)):
    plan_id = body.plan if body.plan in PLANS else "start"
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

    await db.subscriptions.update_one(
        {"seller_id": user["id"]},
        {"$set": {"plan": plan_id, "status": "active_dev", "updated_at": now_iso()},
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


@router.put("/seller/shop")
async def update_shop(body: ShopUpdate, user: dict = Depends(seller_dep)):
    _, shop, _, plan_id = await _seller_context(user)
    if not shop:
        raise HTTPException(status_code=400, detail="Complete onboarding first")
    ent = get_entitlements(plan_id)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    # Central entitlement gating
    if not ent["theme_switching"]:
        updates.pop("theme_preset", None)
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
class ProductBody(BaseModel):
    title: str
    description: Optional[str] = ""
    category: Optional[str] = None
    brand: Optional[str] = ""
    sku: Optional[str] = ""
    price: float
    discount_price: Optional[float] = None
    images: List[str] = []
    variants: list = []
    attributes: list = []
    stock: int = 0
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
    p = body.model_dump()
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
    revenue = sum(o.get("total", 0) for o in await db.orders.find({"shop_id": shop["id"]}, {"_id": 0}).to_list(1000))
    reviews_count = await db.reviews.count_documents({"shop_id": shop["id"]})
    return {
        "metrics": {
            "revenue": revenue,
            "orders": await db.orders.count_documents({"shop_id": shop["id"]}),
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


@router.get("/seller/orders")
async def seller_orders(user: dict = Depends(seller_dep)):
    _, shop, _, _ = await _seller_context(user)
    if not shop:
        return []
    return await db.orders.find({"shop_id": shop["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(200)


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
    await db.subscriptions.update_one(
        {"seller_id": user["id"]},
        {"$set": {"plan": body.plan, "status": "active_dev", "updated_at": now_iso()},
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
    data = await file.read()
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
