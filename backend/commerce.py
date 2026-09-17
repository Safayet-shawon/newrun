from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from db import db, new_id, now_iso
from security import get_current_user, optional_user
from order_models import CartItem
from global_core import normalize_country

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
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0, "session_version": 0})
    return u


class Address(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Optional[str] = None
    label: str = Field(min_length=1, max_length=40)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=6, max_length=24)
    address: str = Field(min_length=3, max_length=300)
    address_line2: Optional[str] = Field(default="", max_length=200)
    area: Optional[str] = Field(default="", max_length=120)
    city: str = Field(min_length=1, max_length=120)
    state: Optional[str] = Field(default="", max_length=120)
    postal_code: Optional[str] = Field(default="", max_length=30)
    country_code: str = Field(default="BD", min_length=2, max_length=2)
    is_default: bool = False


def _address_payload(body: Address) -> dict:
    data = body.model_dump(exclude={"id"})
    data["country_code"] = normalize_country(data.get("country_code"))
    data["full_name"] = data["full_name"].strip()
    data["phone"] = data["phone"].strip()
    data["address"] = data["address"].strip()
    data["city"] = data["city"].strip()
    return data


@router.get("/account/addresses")
async def get_addresses(user: dict = Depends(get_current_user)):
    return await db.addresses.find({"user_id": user["id"]}, {"_id": 0}).sort([("is_default", -1)]).to_list(100)


@router.post("/account/addresses")
async def add_address(body: Address, user: dict = Depends(get_current_user)):
    addr = _address_payload(body)
    addr["id"] = new_id("addr_")
    addr["user_id"] = user["id"]
    if not await db.addresses.find_one({"user_id": user["id"]}):
        addr["is_default"] = True
    if addr["is_default"]:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    await db.addresses.insert_one(dict(addr))
    return addr


@router.put("/account/addresses/{address_id}")
async def update_address(address_id: str, body: Address, user: dict = Depends(get_current_user)):
    current = await db.addresses.find_one({"id": address_id, "user_id": user["id"]}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Address not found")
    updates = _address_payload(body)
    if updates["is_default"]:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    await db.addresses.update_one({"id": address_id, "user_id": user["id"]}, {"$set": {**updates, "updated_at": now_iso()}})
    return await db.addresses.find_one({"id": address_id, "user_id": user["id"]}, {"_id": 0})


@router.delete("/account/addresses/{address_id}")
async def delete_address(address_id: str, user: dict = Depends(get_current_user)):
    deleted = await db.addresses.find_one({"id": address_id, "user_id": user["id"]}, {"_id": 0})
    await db.addresses.delete_one({"id": address_id, "user_id": user["id"]})
    if deleted and deleted.get("is_default"):
        first = await db.addresses.find_one({"user_id": user["id"]}, {"_id": 0})
        if first:
            await db.addresses.update_one({"id": first["id"]}, {"$set": {"is_default": True}})
    return {"ok": True}


@router.get("/account/orders")
async def get_orders(user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"customer_id": user["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(200)
    rows = await db.return_requests.find({"customer_id": user["id"], "order_id": {"$in": [o["id"] for o in orders]}}, {"_id": 0}).to_list(200) if orders else []
    by_order = {row["order_id"]: row for row in rows}
    for order in orders:
        order["return_request"] = by_order.get(order["id"])
    return orders


class ReturnRequestBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=5, max_length=500)


def _parse_order_time(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


@router.post("/account/orders/{order_id}/returns")
async def request_return(order_id: str, body: ReturnRequestBody, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id, "customer_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if order.get("status") != "delivered":
        raise HTTPException(409, "A return can be requested after delivery")
    delivered_at = _parse_order_time(order.get("delivered_at") or order.get("updated_at"))
    if not delivered_at or datetime.now(timezone.utc) - delivered_at > timedelta(days=7):
        raise HTTPException(409, "The 7-day return request window has closed")
    existing = await db.return_requests.find_one({"order_id": order_id}, {"_id": 0})
    if existing:
        return existing
    created_at = now_iso()
    request = {
        "id": new_id("ret_"), "order_id": order_id, "customer_id": user["id"],
        "seller_id": order["seller_id"], "shop_id": order["shop_id"],
        "reason": body.reason.strip(), "status": "requested", "refund_status": "not_started",
        "refund_amount_paisa": int(order.get("total_paisa") or round(float(order.get("total") or 0) * 100)),
        "timeline": [{"status": "requested", "actor": "customer", "actor_id": user["id"], "at": created_at}],
        "created_at": created_at, "updated_at": created_at,
    }
    await db.return_requests.insert_one(dict(request))
    await db.orders.update_one({"id": order_id}, {"$set": {"return_status": "requested", "updated_at": created_at}})
    return request


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
