from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional

from db import db, new_id, now_iso
from security import get_current_user, optional_user
from order_models import CartItem

router = APIRouter()


async def _get_cart(user_id: str):
    cart = await db.carts.find_one({"user_id": user_id}, {"_id": 0})
    if not cart:
        cart = {"user_id": user_id, "items": []}
    return cart


async def _hydrate_cart(cart: dict):
    detailed = []
    for it in cart.get("items", []):
        p = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
        if p:
            detailed.append({"product": p, "qty": it["qty"], "variant": it.get("variant"), "options": it.get("options", {}), "customization": it.get("customization", {})})
    return detailed


class CartSync(BaseModel):
    items: List[CartItem] = []


@router.get("/cart")
async def get_cart(user: dict = Depends(get_current_user)):
    cart = await _get_cart(user["id"])
    return {"items": await _hydrate_cart(cart)}


@router.post("/cart/sync")
async def sync_cart(body: CartSync, user: dict = Depends(get_current_user)):
    items = [i.model_dump() for i in body.items]
    await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": items, "updated_at": now_iso()}}, upsert=True)
    cart = await _get_cart(user["id"])
    return {"items": await _hydrate_cart(cart)}


class WishlistSync(BaseModel):
    product_ids: List[str] = []


@router.get("/wishlist")
async def get_wishlist(user: dict = Depends(get_current_user)):
    wl = await db.wishlists.find_one({"user_id": user["id"]}, {"_id": 0})
    ids = wl["product_ids"] if wl else []
    products = await db.products.find({"id": {"$in": ids}}, {"_id": 0}).to_list(200)
    return {"product_ids": ids, "products": products}


@router.post("/wishlist/sync")
async def sync_wishlist(body: WishlistSync, user: dict = Depends(get_current_user)):
    await db.wishlists.update_one({"user_id": user["id"]}, {"$set": {"product_ids": body.product_ids, "updated_at": now_iso()}}, upsert=True)
    products = await db.products.find({"id": {"$in": body.product_ids}}, {"_id": 0}).to_list(200)
    return {"product_ids": body.product_ids, "products": products}


# ---------- Account: addresses / profile / orders ----------
class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    picture: Optional[str] = None


@router.put("/account/profile")
async def update_profile(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return u


class Address(BaseModel):
    id: Optional[str] = None
    label: str
    full_name: str
    phone: str
    address: str
    city: str
    area: Optional[str] = ""
    is_default: bool = False


@router.get("/account/addresses")
async def get_addresses(user: dict = Depends(get_current_user)):
    return await db.addresses.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)


@router.post("/account/addresses")
async def add_address(body: Address, user: dict = Depends(get_current_user)):
    addr = body.model_dump()
    addr["id"] = new_id("addr_")
    addr["user_id"] = user["id"]
    if addr["is_default"]:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    await db.addresses.insert_one(dict(addr))
    return addr


@router.delete("/account/addresses/{address_id}")
async def delete_address(address_id: str, user: dict = Depends(get_current_user)):
    await db.addresses.delete_one({"id": address_id, "user_id": user["id"]})
    return {"ok": True}


@router.get("/account/orders")
async def get_orders(user: dict = Depends(get_current_user)):
    return await db.orders.find({"customer_id": user["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(200)


# ---------- Customer shop follows / purchase history ----------
@router.get("/shops/{shop_id}/follow")
async def shop_follow_status(shop_id: str, user: Optional[dict] = Depends(optional_user)):
    shop = await db.shops.find_one({"id": shop_id, "status": "published"}, {"_id": 0, "id": 1})
    if not shop:
        raise HTTPException(404, "Shop not found")
    following = bool(user and await db.shop_follows.find_one({"customer_id": user["id"], "shop_id": shop_id}))
    return {"shop_id": shop_id, "following": following}


@router.post("/shops/{shop_id}/follow")
async def follow_shop(shop_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("customer", "admin"):
        raise HTTPException(403, "Customer account required")
    shop = await db.shops.find_one({"id": shop_id, "status": "published"}, {"_id": 0, "id": 1})
    if not shop:
        raise HTTPException(404, "Shop not found")
    await db.shop_follows.update_one(
        {"customer_id": user["id"], "shop_id": shop_id},
        {"$setOnInsert": {"id": new_id("follow_"), "created_at": now_iso()}},
        upsert=True,
    )
    return {"shop_id": shop_id, "following": True}


@router.delete("/shops/{shop_id}/follow")
async def unfollow_shop(shop_id: str, user: dict = Depends(get_current_user)):
    await db.shop_follows.delete_one({"customer_id": user["id"], "shop_id": shop_id})
    return {"shop_id": shop_id, "following": False}


@router.get("/account/followed-shops")
async def followed_shops(user: dict = Depends(get_current_user)):
    follows = await db.shop_follows.find({"customer_id": user["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(500)
    ids = [item["shop_id"] for item in follows]
    records = await db.shops.find({"id": {"$in": ids}, "status": "published"}, {"_id": 0}).to_list(500)
    by_id = {shop["id"]: shop for shop in records}
    result = [by_id[shop_id] for shop_id in ids if shop_id in by_id]
    for shop in result:
        shop["product_count"] = await db.products.count_documents({"shop_id": shop["id"], "status": "published"})
    return result


@router.get("/account/last-purchased")
async def last_purchased(user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"customer_id": user["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(500)
    seen, items = set(), []
    for order in orders:
        for item in order.get("items", []):
            product_id = item.get("product_id")
            if not product_id or product_id in seen:
                continue
            seen.add(product_id)
            product = await db.products.find_one({"id": product_id}, {"_id": 0, "images": 1, "status": 1})
            images = (product or {}).get("images") or [None]
            items.append({**item, "shop_id": order.get("shop_id"), "shop_name": order.get("shop_name"), "order_id": order["id"], "purchased_at": order.get("created_at"), "image": images[0], "available": (product or {}).get("status") == "published"})
    return items[:100]
