from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional

from db import db, new_id, now_iso
from security import get_current_user

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
            detailed.append({"product": p, "qty": it["qty"], "variant": it.get("variant")})
    return detailed


class CartItem(BaseModel):
    product_id: str
    qty: int = 1
    variant: Optional[str] = None


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


class CheckoutBody(BaseModel):
    items: List[CartItem]
    address_id: Optional[str] = None


@router.post("/checkout")
async def checkout(body: CheckoutBody, user: dict = Depends(get_current_user)):
    # Checkout entry only: creates a pending order record grouped by shop (no payment).
    by_shop = {}
    created = []
    skipped = []
    for it in body.items:
        p = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not p or p.get("stock", 0) <= 0:
            if p:
                skipped.append(p["title"])
            continue
        qty = min(it.qty, p.get("stock", 0))
        price = p.get("discount_price") or p["price"]
        by_shop.setdefault(p["shop_id"], {"shop_name": p["shop_name"], "items": [], "total": 0})
        by_shop[p["shop_id"]]["items"].append({"product_id": p["id"], "title": p["title"], "qty": qty, "price": price})
        by_shop[p["shop_id"]]["total"] += price * qty
        await db.products.update_one({"id": p["id"]}, {"$inc": {"stock": -qty, "sold_count": qty}})
    if not by_shop:
        raise HTTPException(status_code=400, detail="No purchasable items in cart (out of stock)")
    for shop_id, data in by_shop.items():
        order = {
            "id": new_id("ord_"),
            "shop_id": shop_id,
            "shop_name": data["shop_name"],
            "customer_id": user["id"],
            "customer_name": user["name"],
            "customer_email": user["email"],
            "items": data["items"],
            "total": data["total"],
            "status": "pending",
            "created_at": now_iso(),
        }
        await db.orders.insert_one(dict(order))
        created.append(order)
    return {"orders": created, "skipped": skipped}
