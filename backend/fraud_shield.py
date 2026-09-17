import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from db import db, now_iso
from security import require_role

router = APIRouter()
seller_dep = require_role("seller")

BAD_STATUSES = {"cancelled", "canceled", "rejected", "failed", "refunded"}
GOOD_STATUSES = {"delivered", "completed"}


def _utcnow():
    return datetime.now(timezone.utc)


def _digits(value):
    return re.sub(r"\D+", "", str(value or ""))[-11:]


def _text(value):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", str(value or "").lower())).strip()


def _order_total_paisa(order):
    if order.get("total_paisa") is not None:
        return max(0, int(order.get("total_paisa") or 0))
    try:
        return max(0, int(round(float(order.get("total") or 0) * 100)))
    except (TypeError, ValueError):
        return 0


def _fingerprint_items(items):
    normalized = []
    for item in items or []:
        normalized.append({
            "product_id": str(item.get("product_id") or ""),
            "qty": int(item.get("qty") or 0),
            "variant": str(item.get("variant") or ""),
            "options": item.get("options") or {},
        })
    normalized.sort(key=lambda row: (row["product_id"], row["variant"], json.dumps(row["options"], sort_keys=True)))
    raw = json.dumps(normalized, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _band(score):
    if score >= 70:
        return "high"
    if score >= 35:
        return "medium"
    return "low"


def _signal(code, points, title, detail, evidence=None):
    return {
        "code": code,
        "points": int(points),
        "title": title,
        "detail": detail,
        "evidence": evidence or {},
    }


async def score_order(order: dict) -> dict:
    seller_id = order.get("seller_id")
    if not seller_id:
        raise ValueError("Order has no seller")

    now = _utcnow()
    address = order.get("delivery_address") or {}
    phone = _digits(address.get("phone"))
    normalized_address = _text(" ".join([
        str(address.get("address") or ""),
        str(address.get("address_line2") or ""),
        str(address.get("area") or ""),
        str(address.get("city") or ""),
    ]))
    fingerprint = _fingerprint_items(order.get("items") or [])
    signals = []
    duplicate_ids = []

    duplicate_window = (now - timedelta(minutes=45)).isoformat()
    recent_query = {
        "seller_id": seller_id,
        "id": {"$ne": order.get("id")},
        "created_at": {"$gte": duplicate_window},
    }
    recent_orders = await db.orders.find(recent_query, {"_id": 0}).sort([("created_at", -1)]).to_list(100)
    for candidate in recent_orders:
        c_address = candidate.get("delivery_address") or {}
        c_phone = _digits(c_address.get("phone"))
        c_norm_address = _text(" ".join([
            str(c_address.get("address") or ""),
            str(c_address.get("address_line2") or ""),
            str(c_address.get("area") or ""),
            str(c_address.get("city") or ""),
        ]))
        c_fingerprint = _fingerprint_items(candidate.get("items") or [])
        same_phone = bool(phone and c_phone and phone == c_phone)
        same_address = bool(normalized_address and c_norm_address and normalized_address == c_norm_address)
        same_items = fingerprint == c_fingerprint
        if same_phone and same_address and same_items:
            duplicate_ids.append(candidate.get("id"))
            signals.append(_signal(
                "exact_duplicate",
                58,
                "Likely duplicate order",
                "Same phone, delivery address and products were ordered recently.",
                {"order_id": candidate.get("id")},
            ))
            break
        if same_phone and same_items:
            duplicate_ids.append(candidate.get("id"))
            signals.append(_signal(
                "phone_product_duplicate",
                38,
                "Possible duplicate order",
                "Same phone and product combination appeared in a recent order.",
                {"order_id": candidate.get("id")},
            ))
            break
        if same_address and same_items:
            duplicate_ids.append(candidate.get("id"))
            signals.append(_signal(
                "address_product_duplicate",
                30,
                "Possible household duplicate",
                "Same address and product combination appeared in a recent order.",
                {"order_id": candidate.get("id")},
            ))
            break

    history_since = (now - timedelta(days=180)).isoformat()
    phone_history = []
    if phone:
        raw_history = await db.orders.find(
            {"seller_id": seller_id, "created_at": {"$gte": history_since}},
            {"_id": 0, "id": 1, "customer_id": 1, "status": 1, "delivery_address": 1, "created_at": 1},
        ).to_list(1000)
        phone_history = [row for row in raw_history if _digits((row.get("delivery_address") or {}).get("phone")) == phone and row.get("id") != order.get("id")]

    bad = sum(1 for row in phone_history if str(row.get("status") or "").lower() in BAD_STATUSES)
    good = sum(1 for row in phone_history if str(row.get("status") or "").lower() in GOOD_STATUSES)
    if bad >= 3 and bad > good:
        signals.append(_signal("repeat_cod_failure", 28, "Repeated failed-order history", f"This phone has {bad} failed/cancelled/refunded orders with this seller.", {"bad_orders": bad, "good_orders": good}))
    elif bad >= 1:
        signals.append(_signal("past_failed_orders", min(16, bad * 6), "Past failed orders", f"This phone has {bad} previous failed/cancelled/refunded order(s).", {"bad_orders": bad, "good_orders": good}))
    if good >= 3 and bad == 0:
        signals.append(_signal("trusted_repeat_customer", -12, "Positive delivery history", f"This phone has {good} successful previous deliveries.", {"good_orders": good}))

    velocity_since = (now - timedelta(hours=6)).isoformat()
    velocity = sum(1 for row in phone_history if str(row.get("created_at") or "") >= velocity_since)
    if velocity >= 3:
        signals.append(_signal("order_velocity", 22, "High order velocity", f"This phone placed {velocity + 1} orders within roughly six hours.", {"recent_orders": velocity + 1}))
    elif velocity == 2:
        signals.append(_signal("order_velocity", 12, "Multiple recent orders", "This phone has several recent orders in a short period.", {"recent_orders": velocity + 1}))

    identities = {row.get("customer_id") for row in phone_history if row.get("customer_id")}
    if len(identities) >= 2:
        signals.append(_signal("shared_phone_accounts", 14, "Phone used by multiple accounts", "The same phone has appeared across multiple customer accounts.", {"account_count": len(identities)}))

    customer = None
    if order.get("customer_id"):
        customer = await db.users.find_one({"id": order["customer_id"]}, {"_id": 0, "created_at": 1, "email_verified": 1})
    if customer:
        created_at = str(customer.get("created_at") or "")
        if created_at and created_at >= (now - timedelta(hours=24)).isoformat():
            signals.append(_signal("new_account", 8, "Very new customer account", "The customer account was created within the last 24 hours."))
        if not customer.get("email_verified"):
            signals.append(_signal("email_unverified", 7, "Email not verified", "The customer has not verified their email address."))

    item_qty = sum(max(0, int(item.get("qty") or 0)) for item in order.get("items") or [])
    if item_qty >= 8:
        signals.append(_signal("unusual_quantity", 8, "Large item quantity", f"This order contains {item_qty} items.", {"quantity": item_qty}))

    seller_recent = await db.orders.find(
        {"seller_id": seller_id, "id": {"$ne": order.get("id")}},
        {"_id": 0, "total_paisa": 1, "total": 1},
    ).sort([("created_at", -1)]).to_list(120)
    totals = [_order_total_paisa(row) for row in seller_recent if _order_total_paisa(row) > 0]
    current_total = _order_total_paisa(order)
    if len(totals) >= 8:
        typical = median(totals)
        if typical > 0 and current_total >= max(500000, typical * 3):
            signals.append(_signal(
                "unusual_order_value",
                12,
                "Unusually high order value",
                "Order value is much higher than this shop's recent typical order.",
                {"order_total_paisa": current_total, "recent_median_paisa": int(typical)},
            ))

    score = max(0, min(100, sum(item["points"] for item in signals)))
    band = _band(score)
    return {
        "score": score,
        "band": band,
        "signals": signals,
        "duplicate_order_ids": list(dict.fromkeys([x for x in duplicate_ids if x])),
        "requires_review": band == "high" or bool(duplicate_ids),
        "scanned_at": now_iso(),
        "version": 1,
    }


async def scan_and_store(order: dict) -> dict:
    risk = await score_order(order)
    review_status = order.get("risk_review_status") or ("pending" if risk["requires_review"] else "not_required")
    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": {
            "risk": risk,
            "risk_score": risk["score"],
            "risk_band": risk["band"],
            "risk_review_status": review_status,
            "risk_hold": bool(risk["requires_review"] and review_status == "pending"),
            "risk_scanned_at": risk["scanned_at"],
        }},
    )
    return {**order, "risk": risk, "risk_score": risk["score"], "risk_band": risk["band"], "risk_review_status": review_status, "risk_hold": bool(risk["requires_review"] and review_status == "pending")}


class ReviewBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["approve", "dismiss", "keep_flagged"]


@router.get("/seller/risk/orders")
async def seller_risk_orders(
    user: dict = Depends(seller_dep),
    limit: int = Query(default=100, ge=1, le=250),
    rescan: bool = True,
):
    orders = await db.orders.find({"seller_id": user["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(limit)
    results = []
    for order in orders:
        if rescan or not order.get("risk"):
            try:
                order = await scan_and_store(order)
            except Exception as exc:
                order = {**order, "risk_error": str(exc)}
        results.append(order)
    results.sort(key=lambda row: (int(row.get("risk_score") or 0), str(row.get("created_at") or "")), reverse=True)
    return results


@router.get("/seller/risk/summary")
async def seller_risk_summary(user: dict = Depends(seller_dep)):
    recent = await db.orders.find({"seller_id": user["id"]}, {"_id": 0, "risk_score": 1, "risk_band": 1, "risk_hold": 1, "risk": 1}).sort([("created_at", -1)]).to_list(500)
    return {
        "high": sum(1 for row in recent if row.get("risk_band") == "high"),
        "medium": sum(1 for row in recent if row.get("risk_band") == "medium"),
        "low": sum(1 for row in recent if row.get("risk_band") == "low"),
        "on_hold": sum(1 for row in recent if row.get("risk_hold")),
        "duplicates": sum(1 for row in recent if (row.get("risk") or {}).get("duplicate_order_ids")),
        "scanned_orders": len(recent),
    }


@router.post("/seller/risk/orders/{order_id}/scan")
async def rescan_order(order_id: str, user: dict = Depends(seller_dep)):
    order = await db.orders.find_one({"id": order_id, "seller_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    return await scan_and_store(order)


@router.post("/seller/risk/orders/{order_id}/review")
async def review_order(order_id: str, body: ReviewBody, user: dict = Depends(seller_dep)):
    order = await db.orders.find_one({"id": order_id, "seller_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    mapping = {"approve": "approved", "dismiss": "dismissed", "keep_flagged": "flagged"}
    status = mapping[body.action]
    await db.orders.update_one(
        {"id": order_id, "seller_id": user["id"]},
        {"$set": {
            "risk_review_status": status,
            "risk_hold": body.action == "keep_flagged",
            "risk_reviewed_at": now_iso(),
            "risk_reviewed_by": user["id"],
        }},
    )
    return await db.orders.find_one({"id": order_id, "seller_id": user["id"]}, {"_id": 0})
