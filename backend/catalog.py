from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional

from db import db, NO_ID, new_id, now_iso
from security import get_current_user, optional_user
from search_engine import smart_product_search, smart_shop_search

router = APIRouter()


async def _shop_public(slug: str):
    shop = await db.shops.find_one({"slug": slug, "status": "published"}, {"_id": 0})
    return shop


def _sort_products(cursor_field: str):
    mapping = {
        "newest": [("created_at", -1)],
        "price_low": [("price", 1)],
        "price_high": [("price", -1)],
        "rating": [("rating", -1)],
        "popular": [("sold_count", -1)],
    }
    return mapping.get(cursor_field, [("sold_count", -1)])


@router.get("/categories")
async def get_categories():
    cats = await db.categories.find({}, {"_id": 0}).to_list(100)
    for c in cats:
        c["product_count"] = await db.products.count_documents({"category": c["slug"], "status": "published"})
    return cats


@router.get("/products")
async def list_products(
    category: Optional[str] = None,
    search: Optional[str] = None,
    shop: Optional[str] = None,
    brand: Optional[str] = None,
    featured: Optional[bool] = None,
    following: bool = False,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    sort: str = "popular",
    limit: int = Query(default=40, ge=1, le=100),
    skip: int = Query(default=0, ge=0, le=10000),
    user: Optional[dict] = Depends(optional_user),
):
    visible_shops = await db.shops.distinct("id", {"status": "published"})
    q = {"status": "published", "shop_id": {"$in": visible_shops}}
    if following:
        if not user:
            raise HTTPException(401, "Sign in to see products from shops you follow")
        followed = await db.shop_follows.distinct("shop_id", {"customer_id": user["id"]})
        q["shop_id"] = {"$in": [shop_id for shop_id in visible_shops if shop_id in set(followed)]}
    if category:
        q["category"] = category
    if shop:
        q["shop_slug"] = shop
    if brand:
        q["brand"] = brand
    if featured is not None:
        q["is_featured"] = featured

    price_q = {}
    if min_price is not None:
        price_q["$gte"] = min_price
    if max_price is not None:
        price_q["$lte"] = max_price
    if price_q:
        q["price"] = price_q
    if sort == "best_selling":
        q["sold_count"] = {"$gt": 0}

    # Search is relevance-first and forgiving: synonyms, Banglish/Bangla aliases,
    # spacing/hyphens/plurals and light typo tolerance are handled centrally.
    if search and search.strip():
        total, items, search_info = await smart_product_search(
            q,
            search,
            sort=sort,
            skip=skip,
            limit=limit,
        )
        return {"total": total, "items": items, "search_info": search_info}

    total = await db.products.count_documents(q)
    if sort in ("price_low", "price_high"):
        items = await db.products.aggregate([
            {"$match": q},
            {"$addFields": {"effective_price": {"$ifNull": ["$discount_price", "$price"]}}},
            {"$sort": {"effective_price": 1 if sort == "price_low" else -1, "id": 1}},
            {"$skip": skip},
            {"$limit": limit},
            {"$project": {"_id": 0, "effective_price": 0}},
        ]).to_list(limit)
    else:
        items = await db.products.find(q, {"_id": 0}).sort(_sort_products(sort)).skip(skip).limit(limit).to_list(limit)
    return {"total": total, "items": items}


@router.get("/products/{product_id}")
async def get_product(product_id: str):
    p = await db.products.find_one({"id": product_id, "status": "published"}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    shop = await db.shops.find_one({"id": p["shop_id"], "status": "published"}, {"_id": 0})
    if not shop:
        raise HTTPException(status_code=404, detail="Shop unavailable")
    similar = await db.products.find(
        {"category": p["category"], "id": {"$ne": product_id}, "status": "published"}, {"_id": 0}
    ).limit(6).to_list(6)
    fbt = await db.products.find(
        {"shop_id": p["shop_id"], "id": {"$ne": product_id}, "status": "published"}, {"_id": 0}
    ).limit(3).to_list(3)
    reviews = await db.reviews.find({"product_id": product_id}, {"_id": 0}).sort([("created_at", -1)]).limit(20).to_list(20)
    return {"product": p, "shop": shop, "similar": similar, "frequently_bought": fbt, "reviews": reviews}


@router.get("/brands")
async def list_brands():
    brands = await db.products.distinct("brand", {"status": "published"})
    return [b for b in brands if b]


@router.get("/shops")
async def list_shops(
    category: Optional[str] = None,
    featured: Optional[bool] = None,
    search: Optional[str] = None,
    limit: int = Query(default=40, ge=1, le=100),
):
    if search and search.strip():
        return await smart_shop_search(search, category=category, featured=featured, limit=limit)

    q = {"status": "published"}
    if category:
        q["category"] = category
    if featured is not None:
        q["is_featured"] = featured
    shops = await db.shops.find(q, {"_id": 0}).sort([("rating", -1)]).limit(limit).to_list(limit)
    for s in shops:
        s["product_count"] = await db.products.count_documents({"shop_id": s["id"], "status": "published"})
    return shops


@router.get("/shops/{slug}")
async def get_shop(slug: str):
    shop = await _shop_public(slug)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found or not published")
    products = await db.products.find({"shop_id": shop["id"], "status": "published"}, {"_id": 0}).to_list(200)
    featured = [p for p in products if p.get("is_featured")][:8]
    reviews = await db.reviews.find({"shop_id": shop["id"]}, {"_id": 0}).sort([("created_at", -1)]).limit(30).to_list(30)
    return {"shop": shop, "products": products, "featured": featured, "reviews": reviews}


@router.get("/home")
async def home_feed():
    visible = await db.shops.distinct("id", {"status": "published"})
    public_products = {"status": "published", "shop_id": {"$in": visible}}
    cats = await db.categories.find({}, {"_id": 0}).to_list(100)
    for c in cats:
        c["product_count"] = await db.products.count_documents({"category": c["slug"], "status": "published"})
    trending = await db.products.find(public_products, {"_id": 0}).sort([("sold_count", -1)]).limit(10).to_list(10)
    top_rated = await db.products.find(public_products, {"_id": 0}).sort([("rating", -1)]).limit(10).to_list(10)
    new_arrivals = await db.products.find(public_products, {"_id": 0}).sort([("created_at", -1)]).limit(10).to_list(10)
    deals = await db.products.find({**public_products, "discount_price": {"$ne": None}}, {"_id": 0}).sort([("sold_count", -1)]).limit(10).to_list(10)
    featured_shops = await db.shops.find({"status": "published", "is_featured": True}, {"_id": 0}).sort([("rating", -1)]).limit(8).to_list(8)
    if not featured_shops:
        featured_shops = await db.shops.find({"status": "published"}, {"_id": 0}).sort([("created_at", -1)]).limit(8).to_list(8)
    for s in featured_shops:
        s["product_count"] = await db.products.count_documents({"shop_id": s["id"], "status": "published"})
    brands = await db.products.distinct("brand", {"status": "published"})
    return {
        "categories": cats,
        "trending": trending,
        "top_rated": top_rated,
        "new_arrivals": new_arrivals,
        "deals": deals,
        "featured_shops": featured_shops,
        "brands": [b for b in brands if b][:12],
    }


class ReviewBody(BaseModel):
    product_id: str
    rating: int = Field(ge=1, le=5, strict=True)
    comment: str = Field(min_length=1, max_length=2000)


@router.post("/reviews")
async def create_review(body: ReviewBody, user: dict = Depends(get_current_user)):
    p = await db.products.find_one({"id": body.product_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    if not body.comment.strip():
        raise HTTPException(422, "Write a review before submitting")
    purchase = await db.orders.find_one({"customer_id": user["id"], "items.product_id": p["id"], "status": "delivered", "payment_mode": {"$ne": "sandbox"}})
    rating = max(1, min(5, body.rating))
    await db.reviews.update_one(
        {"product_id": body.product_id, "user_id": user["id"]},
        {"$set": {"shop_id": p["shop_id"], "user_name": user["name"], "rating": rating, "comment": body.comment.strip(), "verified_purchase": bool(purchase), "created_at": now_iso()},
         "$setOnInsert": {"id": new_id("rev_")}},
        upsert=True,
    )
    all_reviews = await db.reviews.find({"product_id": body.product_id}, {"_id": 0}).to_list(1000)
    avg = round(sum(r["rating"] for r in all_reviews) / len(all_reviews), 1)
    await db.products.update_one({"id": body.product_id}, {"$set": {"rating": avg, "review_count": len(all_reviews)}})
    return {"ok": True, "rating": avg, "review_count": len(all_reviews)}
