"""Atomic multi-vendor order creation. A MongoDB replica set is required for checkout."""
import os
import json
import hashlib
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError, OperationFailure
from db import db, client, new_id, now_iso
from security import get_current_user
from order_models import CheckoutBody
from product_rules import resolve_selection
from wallet import debit_wallet, mode as wallet_mode
from global_core import shipping_for_shop

router = APIRouter()


async def build_quote(body, user, session=None):
    if user.get("role") not in ("customer", "admin"):
        raise HTTPException(403, "Customer account required")
    if os.getenv("REQUIRE_EMAIL_VERIFICATION", "false").lower() in {"1", "true", "yes", "on"} and user.get("role") != "admin" and not user.get("email_verified"):
        raise HTTPException(403, "Verify your email before checkout")

    address = await db.addresses.find_one({"id": body.address_id, "user_id": user["id"]}, {"_id": 0}, session=session)
    if not address:
        raise HTTPException(422, "Select a delivery address belonging to your account")
    if any(not str(address.get(k, " ")).strip() for k in ("full_name", "phone", "address", "city", "country_code")):
        raise HTTPException(422, "Complete your delivery address including country")

    grouped = {}
    stock_totals = defaultdict(int)
    variant_totals = defaultdict(int)
    inventory = {}
    shops = {}

    for item in body.items:
        p = await db.products.find_one({"id": item.product_id, "status": "published"}, {"_id": 0}, session=session)
        if not p:
            raise HTTPException(409, "A product is no longer available")
        shop = await db.shops.find_one({"id": p["shop_id"], "status": "published"}, {"_id": 0}, session=session)
        if not shop:
            raise HTTPException(409, f"{p['title']} is from an unavailable shop")
        seller = await db.users.find_one({"id": shop["seller_id"]}, {"_id": 0, "status": 1}, session=session)
        if not seller or seller.get("status", "active") != "active":
            raise HTTPException(409, "This seller is currently unavailable")

        options, custom, unit, index = resolve_selection(p, item)
        stock_totals[p["id"]] += item.qty
        if stock_totals[p["id"]] > p.get("stock", 0):
            raise HTTPException(409, f"Insufficient stock for {p['title']}; update your cart")
        if index is not None:
            variant_totals[(p["id"], index)] += item.qty
            if variant_totals[(p["id"], index)] > p["variant_inventory"][index]["stock"]:
                raise HTTPException(409, f"Selected options for {p['title']} are out of stock")

        inventory[p["id"]] = p
        shops[shop["id"]] = shop
        group = grouped.setdefault(shop["id"], {
            "shop_id": shop["id"],
            "shop_name": shop["name"],
            "shop_slug": shop["slug"],
            "seller_id": shop["seller_id"],
            "items": [],
            "subtotal_paisa": 0,
        })
        group["items"].append({
            "product_id": p["id"],
            "title": p["title"],
            "qty": item.qty,
            "price": unit / 100,
            "unit_price_paisa": unit,
            "currency": p.get("currency", "BDT"),
            "options": options,
            "customization": custom,
            "variant": " / ".join(f"{k}: {v}" for k, v in options.items()),
            "product_type": p.get("product_type", "general"),
        })
        group["subtotal_paisa"] += unit * item.qty

    subtotal = sum(g["subtotal_paisa"] for g in grouped.values())
    total_shipping = 0
    for group in grouped.values():
        try:
            shipping = shipping_for_shop(shops[group["shop_id"]], address, group["subtotal_paisa"])
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        group["delivery_paisa"] = shipping
        group["total_paisa"] = group["subtotal_paisa"] + shipping
        group["total"] = group["total_paisa"] / 100
        group["currency"] = "BDT"
        total_shipping += shipping

    quote = {
        "groups": list(grouped.values()),
        "subtotal_paisa": subtotal,
        "delivery_paisa": total_shipping,
        "total_paisa": subtotal + total_shipping,
        "currency": "BDT",
        "payment_method": body.payment_method,
    }
    return quote, address, stock_totals, variant_totals, inventory


@router.post("/checkout/quote")
async def quote_order(body: CheckoutBody, user: dict = Depends(get_current_user)):
    quote, *_ = await build_quote(body, user)
    return quote


@router.post("/checkout")
async def checkout(body: CheckoutBody, user: dict = Depends(get_current_user)):
    identity = {"customer_id": user["id"], "key": body.idempotency_key}
    digest = hashlib.sha256(json.dumps(body.model_dump(exclude={"idempotency_key"}), sort_keys=True).encode()).hexdigest()
    previous = await db.checkouts.find_one(identity, {"_id": 0})
    if previous:
        if previous["digest"] != digest:
            raise HTTPException(409, "Checkout key was already used for a different order")
        return {"orders": previous["orders"], "skipped": [], "replayed": True}

    async def commit(session):
        quote, address, stocks, variants, inventory = await build_quote(body, user, session)
        if body.expected_total_paisa is None or quote["total_paisa"] != body.expected_total_paisa:
            raise HTTPException(409, "Prices or delivery charges changed. Refresh the order quote.")
        created = []
        checkout_id = new_id("checkout_")
        if body.payment_method == "nexora_wallet":
            await debit_wallet(user["id"], quote["total_paisa"], checkout_id, session)

        for product_id, qty in stocks.items():
            increments = {"stock": -qty, "sold_count": qty}
            condition = {"id": product_id, "status": "published", "stock": {"$gte": qty}}
            p = inventory[product_id]
            condition["price"] = p["price"]
            condition["discount_price"] = p.get("discount_price")
            if "variants" in p:
                condition["variants"] = p["variants"]
            if "variant_inventory" in p:
                condition["variant_inventory"] = p["variant_inventory"]
            for (pid, index), vq in variants.items():
                if pid == product_id:
                    condition[f"variant_inventory.{index}.stock"] = {"$gte": vq}
                    increments[f"variant_inventory.{index}.stock"] = -vq
            changed = await db.products.update_one(condition, {"$inc": increments}, session=session)
            if changed.modified_count != 1:
                raise HTTPException(409, "Stock or options changed. Review your cart and try again.")

        for group in quote["groups"]:
            order = {
                **group,
                "id": new_id("ord_"),
                "checkout_id": checkout_id,
                "customer_id": user["id"],
                "customer_name": user["name"],
                "customer_email": user["email"],
                "delivery_address": {k: v for k, v in address.items() if k not in ("user_id", "_id")},
                "status": "pending",
                "payment_status": "unpaid",
                "payment_method": body.payment_method,
                "currency": "BDT",
                "commission_status": "policy_pending",
                "commission_rate": None,
                "created_at": now_iso(),
            }
            if body.payment_method == "nexora_wallet":
                order["payment_status"] = "paid"
                order["payment_mode"] = wallet_mode()
            await db.orders.insert_one(dict(order), session=session)
            created.append(order)

        await db.checkouts.insert_one({**identity, "digest": digest, "orders": created, "currency": "BDT", "created_at": now_iso()}, session=session)
        await db.carts.update_one({"user_id": user["id"]}, {"$set": {"items": [], "updated_at": now_iso()}}, session=session)
        await db.audit_events.insert_one({"id": new_id("audit_"), "actor_id": user["id"], "action": "checkout.created", "resource_id": checkout_id, "created_at": now_iso()}, session=session)
        return {"orders": created, "skipped": [], "replayed": False}

    try:
        async with await client.start_session() as session:
            return await session.with_transaction(commit)
    except DuplicateKeyError:
        previous = await db.checkouts.find_one(identity, {"_id": 0})
        if previous and previous["digest"] == digest:
            return {"orders": previous["orders"], "skipped": [], "replayed": True}
        raise HTTPException(409, "An order is already being submitted. Check your order history.")
    except OperationFailure as error:
        if error.code in (20, 303):
            raise HTTPException(503, "Checkout requires a transaction-capable database. No order was placed.")
        raise
