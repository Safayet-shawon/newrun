"""Seller Growth OS: profit intelligence, fraud decisions, courier routing and customer 360."""
import math
import re
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from db import db, new_id, now_iso
from security import require_role
import fraud_shield

router = APIRouter()
seller_dep = require_role("seller")

PROVIDERS = ("pathao", "steadfast", "redx")
GOOD_STATUSES = {"delivered", "completed"}
BAD_STATUSES = {"cancelled", "canceled", "rejected", "failed", "refunded", "returned"}
DEFAULT_FRAUD_RULES = {
    "otp_score": 35,
    "manual_review_score": 55,
    "advance_score": 72,
    "block_cod_score": 90,
    "advance_amount_paisa": 20000,
    "duplicate_requires_review": True,
}
DEFAULT_COURIERS = {
    "pathao": {"enabled": True, "base_rate_paisa": None, "cod_percent": None, "eta_days": 2, "priority": 1},
    "steadfast": {"enabled": True, "base_rate_paisa": None, "cod_percent": None, "eta_days": 2, "priority": 1},
    "redx": {"enabled": True, "base_rate_paisa": None, "cod_percent": None, "eta_days": 3, "priority": 1},
}


def _utcnow():
    return datetime.now(timezone.utc)


def _parse_iso(value):
    try:
        parsed = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _digits(value):
    return re.sub(r"\D+", "", str(value or ""))[-11:]


def _paisa(value):
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _order_total_paisa(order):
    if order.get("total_paisa") is not None:
        return _paisa(order.get("total_paisa"))
    try:
        return max(0, int(round(float(order.get("total") or 0) * 100)))
    except (TypeError, ValueError):
        return 0


async def ensure_indexes():
    await db.seller_growth_settings.create_index("seller_id", unique=True)
    await db.courier_profiles.create_index("seller_id", unique=True)
    await db.product_costs.create_index([("seller_id", 1), ("product_id", 1)], unique=True)
    await db.channel_sync_connectors.create_index([("seller_id", 1), ("source_type", 1)], unique=True)
    await db.channel_sync_jobs.create_index([("seller_id", 1), ("created_at", -1)])


async def _growth_settings(seller_id: str):
    row = await db.seller_growth_settings.find_one({"seller_id": seller_id}, {"_id": 0}) or {}
    return {
        "fraud_rules": {**DEFAULT_FRAUD_RULES, **(row.get("fraud_rules") or {})},
        "monthly_ad_spend_paisa": _paisa(row.get("monthly_ad_spend_paisa")),
        "order_edit_window_minutes": max(1, min(60, int(row.get("order_edit_window_minutes") or 10))),
    }


async def _courier_profile(seller_id: str):
    row = await db.courier_profiles.find_one({"seller_id": seller_id}, {"_id": 0}) or {}
    saved = row.get("providers") or {}
    providers = {}
    for provider in PROVIDERS:
        providers[provider] = {**DEFAULT_COURIERS[provider], **(saved.get(provider) or {})}
    return {"providers": providers, "strategy": row.get("strategy") or "balanced", "updated_at": row.get("updated_at")}


async def _provider_stats(seller_id: str):
    shipments = await db.shipments.find({"seller_id": seller_id}, {"_id": 0, "provider": 1, "status": 1, "order_id": 1}).to_list(3000)
    order_ids = [row.get("order_id") for row in shipments if row.get("order_id")]
    order_map = {}
    if order_ids:
        orders = await db.orders.find({"id": {"$in": order_ids}}, {"_id": 0, "id": 1, "status": 1}).to_list(len(order_ids))
        order_map = {row["id"]: row for row in orders}

    out = {}
    for provider in PROVIDERS:
        rows = [s for s in shipments if str(s.get("provider") or "").lower() == provider]
        delivered = 0
        failed = 0
        for shipment in rows:
            status = str((order_map.get(shipment.get("order_id")) or {}).get("status") or shipment.get("status") or "").lower()
            delivered += int(status in GOOD_STATUSES)
            failed += int(status in BAD_STATUSES)
        finished = delivered + failed
        success_rate = delivered / finished if finished else None
        out[provider] = {
            "shipments": len(rows),
            "delivered": delivered,
            "failed": failed,
            "success_rate": round(success_rate, 4) if success_rate is not None else None,
        }
    return out


def _courier_score(config, stats, max_rate):
    success = stats.get("success_rate")
    success_component = (success if success is not None else 0.80) * 60
    eta = max(1, min(10, int(config.get("eta_days") or 3)))
    speed_component = max(0, 20 - ((eta - 1) * 3))
    rate = config.get("base_rate_paisa")
    if rate is None or max_rate <= 0:
        cost_component = 7.5
    else:
        cost_component = max(0, 15 * (1 - (_paisa(rate) / max_rate) * 0.7))
    priority_component = max(0, min(5, float(config.get("priority") or 1) * 2.5))
    return round(success_component + speed_component + cost_component + priority_component, 1)


async def courier_recommendations(seller_id: str, order: Optional[dict] = None):
    profile = await _courier_profile(seller_id)
    stats = await _provider_stats(seller_id)
    enabled = {k: v for k, v in profile["providers"].items() if v.get("enabled")}
    known_rates = [_paisa(v.get("base_rate_paisa")) for v in enabled.values() if v.get("base_rate_paisa") is not None]
    max_rate = max(known_rates) if known_rates else 0
    rows = []
    for provider, config in enabled.items():
        provider_stats = stats.get(provider) or {}
        score = _courier_score(config, provider_stats, max_rate)
        rate = config.get("base_rate_paisa")
        cod_percent = config.get("cod_percent")
        estimated_cost = None
        if rate is not None:
            estimated_cost = _paisa(rate)
            if order and cod_percent is not None and str(order.get("payment_method") or "") == "cash_on_delivery":
                estimated_cost += int(round(_order_total_paisa(order) * float(cod_percent) / 100))
        rows.append({
            "provider": provider,
            "score": score,
            "estimated_cost_paisa": estimated_cost,
            "eta_days": int(config.get("eta_days") or 3),
            "priority": config.get("priority") or 1,
            "history": provider_stats,
            "connection_status": config.get("connection_status") or "not_connected",
            "reason": "Balanced on configured cost, estimated speed and seller delivery history.",
        })
    strategy = profile.get("strategy") or "balanced"
    if strategy == "cheapest":
        rows.sort(key=lambda r: (r["estimated_cost_paisa"] is None, r["estimated_cost_paisa"] or 10**12, -r["score"]))
    elif strategy == "fastest":
        rows.sort(key=lambda r: (r["eta_days"], -r["score"]))
    elif strategy == "highest_success":
        rows.sort(key=lambda r: (-(r["history"].get("success_rate") if r["history"].get("success_rate") is not None else 0.8), -r["score"]))
    else:
        rows.sort(key=lambda r: -r["score"])
    for index, row in enumerate(rows):
        row["recommended"] = index == 0
    return {"strategy": strategy, "recommendations": rows, "order_id": order.get("id") if order else None}


async def ensure_order_decision(order: dict):
    seller_id = order.get("seller_id")
    if not seller_id:
        raise ValueError("Order has no seller")
    if not order.get("risk"):
        order = await fraud_shield.scan_and_store(order)
    rules = (await _growth_settings(seller_id))["fraud_rules"]
    risk = order.get("risk") or {}
    score = int(order.get("risk_score") or risk.get("score") or 0)
    duplicate = bool(risk.get("duplicate_order_ids"))
    action = "allow"
    reason = "Risk signals are within the seller's automatic acceptance rules."

    if score >= int(rules["block_cod_score"]) and str(order.get("payment_method") or "") == "cash_on_delivery":
        action = "block_cod"
        reason = "Risk score crossed the seller's COD blocking threshold."
    elif score >= int(rules["advance_score"]):
        action = "request_advance"
        reason = "Risk score crossed the advance-payment threshold."
    elif duplicate and rules.get("duplicate_requires_review", True):
        action = "manual_review"
        reason = "A recent duplicate-like order requires seller review."
    elif score >= int(rules["manual_review_score"]):
        action = "manual_review"
        reason = "Risk score crossed the manual-review threshold."
    elif score >= int(rules["otp_score"]):
        action = "otp_verify"
        reason = "Risk score crossed the OTP verification threshold."

    requires_action = action != "allow"
    decision = {
        "action": action,
        "requires_action": requires_action,
        "reason": reason,
        "risk_score": score,
        "advance_amount_paisa": _paisa(rules.get("advance_amount_paisa")) if action == "request_advance" else 0,
        "decided_at": now_iso(),
        "version": 1,
    }
    previous = order.get("fraud_verification") or {}
    verified = previous.get("status") in {"approve", "approved", "otp_verified", "call_verified", "advance_received"}
    operational_hold = bool(requires_action and not verified)
    await db.orders.update_one(
        {"id": order["id"], "seller_id": seller_id},
        {"$set": {
            "fraud_decision": decision,
            "operational_hold": operational_hold,
            "operational_hold_reason": reason if operational_hold else None,
            "fraud_decided_at": decision["decided_at"],
        }},
    )
    return {**order, "fraud_decision": decision, "operational_hold": operational_hold}


class FraudRulesBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    otp_score: int = Field(ge=0, le=100)
    manual_review_score: int = Field(ge=0, le=100)
    advance_score: int = Field(ge=0, le=100)
    block_cod_score: int = Field(ge=0, le=100)
    advance_amount_bdt: float = Field(default=200, ge=0, le=100000)
    duplicate_requires_review: bool = True


@router.get("/seller/growth/fraud-rules")
async def get_fraud_rules(user: dict = Depends(seller_dep)):
    return (await _growth_settings(user["id"]))["fraud_rules"]


@router.put("/seller/growth/fraud-rules")
async def update_fraud_rules(body: FraudRulesBody, user: dict = Depends(seller_dep)):
    if not (body.otp_score <= body.manual_review_score <= body.advance_score <= body.block_cod_score):
        raise HTTPException(422, "Thresholds must increase from OTP to manual review to advance to block COD")
    rules = {
        "otp_score": body.otp_score,
        "manual_review_score": body.manual_review_score,
        "advance_score": body.advance_score,
        "block_cod_score": body.block_cod_score,
        "advance_amount_paisa": int(round(body.advance_amount_bdt * 100)),
        "duplicate_requires_review": body.duplicate_requires_review,
    }
    await db.seller_growth_settings.update_one(
        {"seller_id": user["id"]},
        {"$set": {"fraud_rules": rules, "updated_at": now_iso()}, "$setOnInsert": {"created_at": now_iso()}},
        upsert=True,
    )
    return rules


class VerificationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["approve", "otp_verified", "call_verified", "advance_received", "keep_hold"]
    note: str = Field(default="", max_length=500)


@router.post("/seller/growth/orders/{order_id}/verification")
async def verify_order(order_id: str, body: VerificationBody, user: dict = Depends(seller_dep)):
    order = await db.orders.find_one({"id": order_id, "seller_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    hold = body.action == "keep_hold"
    verification = {
        "status": body.action,
        "note": body.note.strip(),
        "actor_id": user["id"],
        "verified_at": now_iso(),
    }
    await db.orders.update_one(
        {"id": order_id, "seller_id": user["id"]},
        {"$set": {
            "fraud_verification": verification,
            "operational_hold": hold,
            "operational_hold_reason": "Seller kept this order on hold." if hold else None,
        }},
    )
    return await db.orders.find_one({"id": order_id, "seller_id": user["id"]}, {"_id": 0})


class CourierProviderConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = True
    base_rate_bdt: Optional[float] = Field(default=None, ge=0, le=10000)
    cod_percent: Optional[float] = Field(default=None, ge=0, le=100)
    eta_days: int = Field(default=2, ge=1, le=14)
    priority: int = Field(default=1, ge=0, le=2)
    connection_status: Literal["not_connected", "configured", "connected"] = "not_connected"


class CourierSettingsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    strategy: Literal["balanced", "cheapest", "fastest", "highest_success"] = "balanced"
    pathao: CourierProviderConfig
    steadfast: CourierProviderConfig
    redx: CourierProviderConfig


@router.get("/seller/growth/couriers")
async def get_couriers(user: dict = Depends(seller_dep)):
    profile = await _courier_profile(user["id"])
    stats = await _provider_stats(user["id"])
    return {**profile, "stats": stats}


@router.put("/seller/growth/couriers")
async def update_couriers(body: CourierSettingsBody, user: dict = Depends(seller_dep)):
    providers = {}
    for provider in PROVIDERS:
        cfg = getattr(body, provider)
        providers[provider] = {
            "enabled": cfg.enabled,
            "base_rate_paisa": None if cfg.base_rate_bdt is None else int(round(cfg.base_rate_bdt * 100)),
            "cod_percent": cfg.cod_percent,
            "eta_days": cfg.eta_days,
            "priority": cfg.priority,
            "connection_status": cfg.connection_status,
        }
    await db.courier_profiles.update_one(
        {"seller_id": user["id"]},
        {"$set": {"providers": providers, "strategy": body.strategy, "updated_at": now_iso()}, "$setOnInsert": {"created_at": now_iso()}},
        upsert=True,
    )
    return await get_couriers(user)


@router.get("/seller/growth/couriers/recommend/{order_id}")
async def recommend_courier(order_id: str, user: dict = Depends(seller_dep)):
    order = await db.orders.find_one({"id": order_id, "seller_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    return await courier_recommendations(user["id"], order)


class CourierSelectBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: Literal["pathao", "steadfast", "redx"]


@router.post("/seller/growth/couriers/select/{order_id}")
async def select_courier(order_id: str, body: CourierSelectBody, user: dict = Depends(seller_dep)):
    order = await db.orders.find_one({"id": order_id, "seller_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    shipment = await db.shipments.find_one({"order_id": order_id}, {"_id": 0})
    if shipment and shipment.get("tracking_code"):
        raise HTTPException(409, "Courier is already booked for this order")
    recommendation = await courier_recommendations(user["id"], order)
    available = {row["provider"] for row in recommendation["recommendations"]}
    if body.provider not in available:
        raise HTTPException(409, "That courier is disabled in Courier Autopilot")
    await db.orders.update_one(
        {"id": order_id, "seller_id": user["id"]},
        {"$set": {"selected_courier": body.provider, "courier_selected_at": now_iso()}},
    )
    return {"ok": True, "provider": body.provider, "booking_status": "selected_not_booked"}


class ProfitSettingsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    monthly_ad_spend_bdt: float = Field(default=0, ge=0, le=100000000)
    product_costs_bdt: dict[str, float] = Field(default_factory=dict)


@router.get("/seller/growth/profit-settings")
async def get_profit_settings(user: dict = Depends(seller_dep)):
    settings = await _growth_settings(user["id"])
    rows = await db.product_costs.find({"seller_id": user["id"]}, {"_id": 0}).to_list(5000)
    return {
        "monthly_ad_spend_bdt": settings["monthly_ad_spend_paisa"] / 100,
        "product_costs_bdt": {row["product_id"]: _paisa(row.get("unit_cost_paisa")) / 100 for row in rows},
    }


@router.put("/seller/growth/profit-settings")
async def update_profit_settings(body: ProfitSettingsBody, user: dict = Depends(seller_dep)):
    await db.seller_growth_settings.update_one(
        {"seller_id": user["id"]},
        {"$set": {"monthly_ad_spend_paisa": int(round(body.monthly_ad_spend_bdt * 100)), "updated_at": now_iso()}, "$setOnInsert": {"created_at": now_iso()}},
        upsert=True,
    )
    for product_id, cost_bdt in body.product_costs_bdt.items():
        if len(product_id) > 120 or cost_bdt < 0 or not math.isfinite(cost_bdt):
            continue
        await db.product_costs.update_one(
            {"seller_id": user["id"], "product_id": product_id},
            {"$set": {"unit_cost_paisa": int(round(cost_bdt * 100)), "updated_at": now_iso()}, "$setOnInsert": {"created_at": now_iso()}},
            upsert=True,
        )
    return await get_profit_settings(user)


async def build_profit_summary(seller_id: str, days: int):
    since = (_utcnow() - timedelta(days=days)).isoformat()
    orders = await db.orders.find({"seller_id": seller_id, "created_at": {"$gte": since}}, {"_id": 0}).to_list(10000)
    cost_rows = await db.product_costs.find({"seller_id": seller_id}, {"_id": 0}).to_list(5000)
    costs = {row["product_id"]: _paisa(row.get("unit_cost_paisa")) for row in cost_rows}
    settings = await _growth_settings(seller_id)

    placed_revenue = sum(_order_total_paisa(row) for row in orders)
    realized_orders = [row for row in orders if str(row.get("status") or "").lower() in GOOD_STATUSES or row.get("payment_status") == "paid"]
    realized_revenue = sum(_order_total_paisa(row) for row in realized_orders)
    failed_orders = [row for row in orders if str(row.get("status") or "").lower() in BAD_STATUSES]
    at_risk_value = sum(_order_total_paisa(row) for row in failed_orders)
    commission = sum(_paisa((row.get("accounting") or {}).get("platform_commission_paisa")) for row in realized_orders)

    cogs = 0
    known_cost_units = 0
    total_units = 0
    for order in realized_orders:
        for item in order.get("items") or []:
            qty = max(0, int(item.get("qty") or 0))
            total_units += qty
            if item.get("product_id") in costs:
                cogs += costs[item["product_id"]] * qty
                known_cost_units += qty

    monthly_ads = settings["monthly_ad_spend_paisa"]
    prorated_ads = int(round(monthly_ads * min(days, 31) / 30))
    operating_profit = realized_revenue - cogs - commission - prorated_ads
    margin = (operating_profit / realized_revenue * 100) if realized_revenue else 0
    held = sum(1 for row in orders if row.get("operational_hold") or row.get("risk_hold"))
    duplicates = sum(1 for row in orders if ((row.get("risk") or {}).get("duplicate_order_ids")))

    return {
        "days": days,
        "orders": len(orders),
        "realized_orders": len(realized_orders),
        "placed_revenue_paisa": placed_revenue,
        "realized_revenue_paisa": realized_revenue,
        "cogs_paisa": cogs,
        "commission_paisa": commission,
        "ad_spend_paisa": prorated_ads,
        "estimated_operating_profit_paisa": operating_profit,
        "estimated_margin_percent": round(margin, 1),
        "failed_or_returned_value_paisa": at_risk_value,
        "fraud_holds": held,
        "duplicate_flags": duplicates,
        "cost_coverage_percent": round((known_cost_units / total_units * 100) if total_units else 0, 1),
        "data_quality": "complete" if total_units and known_cost_units == total_units else "partial",
        "note": "Operating profit excludes taxes, payout timing and unrecorded expenses. Add product costs and ad spend for better accuracy.",
    }


@router.get("/seller/growth/profit")
async def profit_os(days: int = Query(default=30, ge=1, le=365), user: dict = Depends(seller_dep)):
    return await build_profit_summary(user["id"], days)


async def customer_360_rows(seller_id: str, limit: int = 500):
    orders = await db.orders.find({"seller_id": seller_id}, {"_id": 0}).sort([("created_at", -1)]).to_list(10000)
    groups = {}
    for order in orders:
        address = order.get("delivery_address") or {}
        phone = _digits(address.get("phone"))
        email = str(order.get("customer_email") or "").strip().lower()
        customer_id = str(order.get("customer_id") or "")
        key = customer_id or phone or email or order.get("id")
        row = groups.setdefault(key, {
            "key": key,
            "customer_id": customer_id or None,
            "name": order.get("customer_name") or address.get("full_name") or "Customer",
            "phone": phone or None,
            "email": email or None,
            "orders": 0,
            "delivered": 0,
            "failed": 0,
            "lifetime_value_paisa": 0,
            "last_order_at": order.get("created_at"),
            "risk_scores": [],
            "channels": {"store"},
        })
        row["orders"] += 1
        status = str(order.get("status") or "").lower()
        if status in GOOD_STATUSES:
            row["delivered"] += 1
            row["lifetime_value_paisa"] += _order_total_paisa(order)
        if status in BAD_STATUSES:
            row["failed"] += 1
        if order.get("risk_score") is not None:
            row["risk_scores"].append(int(order.get("risk_score") or 0))
        if str(order.get("created_at") or "") > str(row.get("last_order_at") or ""):
            row["last_order_at"] = order.get("created_at")

    conversations = await db.conversations.find({"seller_id": seller_id}, {"_id": 0, "provider": 1, "external_customer_id": 1}).to_list(5000)
    for conversation in conversations:
        ext = _digits(conversation.get("external_customer_id"))
        if not ext:
            continue
        for row in groups.values():
            if row.get("phone") == ext:
                row["channels"].add(conversation.get("provider") or "chat")

    output = []
    for row in groups.values():
        row["average_risk_score"] = round(sum(row["risk_scores"]) / len(row["risk_scores"]), 1) if row["risk_scores"] else 0
        row.pop("risk_scores", None)
        row["channels"] = sorted(row["channels"])
        if row["orders"] >= 3 and row["delivered"] >= 3:
            row["segment"] = "VIP" if row["lifetime_value_paisa"] >= 200000 else "Repeat"
        elif row["failed"] >= 2:
            row["segment"] = "Risk"
        else:
            row["segment"] = "New"
        output.append(row)
    output.sort(key=lambda r: (r["lifetime_value_paisa"], r["orders"]), reverse=True)
    return output[:limit]


@router.get("/seller/growth/customers")
async def customer_360(limit: int = Query(default=200, ge=1, le=1000), user: dict = Depends(seller_dep)):
    rows = await customer_360_rows(user["id"], limit)
    return {
        "customers": rows,
        "segments": {
            "vip": sum(1 for r in rows if r["segment"] == "VIP"),
            "repeat": sum(1 for r in rows if r["segment"] == "Repeat"),
            "risk": sum(1 for r in rows if r["segment"] == "Risk"),
            "new": sum(1 for r in rows if r["segment"] == "New"),
        },
    }


class CopilotBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt: str = Field(min_length=2, max_length=1000)


@router.post("/seller/growth/copilot")
async def growth_copilot(body: CopilotBody, user: dict = Depends(seller_dep)):
    prompt = body.prompt.lower()
    profit = await build_profit_summary(user["id"], 30)
    facts = []
    actions = []

    if any(word in prompt for word in ("profit", "sales", "revenue", "margin", "লাভ", "বিক্রি")):
        answer = (
            f"In the last 30 days your realized revenue is ৳{profit['realized_revenue_paisa']/100:,.0f}. "
            f"Estimated operating profit is ৳{profit['estimated_operating_profit_paisa']/100:,.0f} "
            f"at {profit['estimated_margin_percent']}% margin. Product-cost coverage is {profit['cost_coverage_percent']}%."
        )
        facts = ["realized_revenue", "estimated_operating_profit", "cost_coverage"]
        actions = [{"type": "open_profit_settings", "label": "Improve profit accuracy"}]
    elif any(word in prompt for word in ("courier", "delivery", "pathao", "steadfast", "redx")):
        routing = await courier_recommendations(user["id"])
        top = routing["recommendations"][0] if routing["recommendations"] else None
        if top:
            answer = f"Courier Autopilot currently ranks {top['provider'].title()} first with a score of {top['score']}/100 under your {routing['strategy']} strategy."
            facts = ["courier_score", "delivery_history"]
            actions = [{"type": "open_courier_settings", "label": "Tune courier strategy"}]
        else:
            answer = "No courier is enabled. Enable at least one provider in Courier Autopilot."
            actions = [{"type": "open_courier_settings", "label": "Enable courier"}]
    elif any(word in prompt for word in ("fraud", "fake", "duplicate", "cod", "risk")):
        high = await db.orders.count_documents({"seller_id": user["id"], "$or": [{"risk_band": "high"}, {"operational_hold": True}]})
        answer = f"You currently have {high} high-risk or operationally-held order(s). Fraud Decision Engine can require OTP, advance payment, manual review or block COD based on your thresholds."
        facts = ["risk_holds", "fraud_rules"]
        actions = [{"type": "open_fraud_rules", "label": "Tune fraud rules"}]
    elif any(word in prompt for word in ("restock", "stock", "inventory")):
        products = await db.products.find({"seller_id": user["id"], "status": "published"}, {"_id": 0, "id": 1, "title": 1, "stock": 1, "sold_count": 1}).sort([("sold_count", -1)]).to_list(200)
        candidates = [p for p in products if int(p.get("stock") or 0) <= 5][:5]
        if candidates:
            names = ", ".join(p.get("title") or p.get("id") for p in candidates)
            answer = f"Low-stock products worth checking first: {names}."
            facts = ["stock", "sold_count"]
            actions = [{"type": "open_inventory", "label": "Review inventory"}]
        else:
            answer = "No published product is currently at or below 5 units of stock."
            facts = ["stock"]
    else:
        customers = await customer_360_rows(user["id"], 200)
        vip = sum(1 for row in customers if row["segment"] == "VIP")
        answer = (
            f"Your 30-day realized revenue is ৳{profit['realized_revenue_paisa']/100:,.0f}, "
            f"estimated operating profit is ৳{profit['estimated_operating_profit_paisa']/100:,.0f}, "
            f"and Customer 360 currently identifies {vip} VIP customer(s). Ask about profit, fraud, courier, customers or restocking."
        )
        facts = ["profit", "customer_360"]
        actions = [{"type": "open_growth_os", "label": "View Growth OS"}]

    return {
        "answer": answer,
        "facts": facts,
        "actions": actions,
        "mode": "data_copilot",
        "note": "Answers are generated from Nexora seller data and deterministic business rules; no external model is required for this response.",
    }


class ConnectorBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_type: Literal["website", "woocommerce", "shopify", "facebook_catalog", "daraz_csv"]
    enabled: bool = True
    source_url: Optional[str] = Field(default=None, max_length=1000)
    sync_frequency_hours: int = Field(default=24, ge=1, le=168)


@router.get("/seller/growth/connectors")
async def list_connectors(user: dict = Depends(seller_dep)):
    rows = await db.channel_sync_connectors.find({"seller_id": user["id"]}, {"_id": 0}).sort([("source_type", 1)]).to_list(20)
    latest_scan = await db.store_import_scans.find_one({"seller_id": user["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    latest_job = await db.channel_sync_jobs.find_one({"seller_id": user["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    return {"connectors": rows, "latest_import_scan": latest_scan, "latest_sync_job": latest_job}


@router.put("/seller/growth/connectors/{source_type}")
async def save_connector(source_type: str, body: ConnectorBody, user: dict = Depends(seller_dep)):
    if source_type != body.source_type:
        raise HTTPException(422, "Connector type does not match the URL")
    record = {
        "seller_id": user["id"],
        "source_type": body.source_type,
        "enabled": body.enabled,
        "source_url": body.source_url,
        "sync_frequency_hours": body.sync_frequency_hours,
        "status": "configured",
        "updated_at": now_iso(),
    }
    await db.channel_sync_connectors.update_one(
        {"seller_id": user["id"], "source_type": source_type},
        {"$set": record, "$setOnInsert": {"id": new_id("conn_"), "created_at": now_iso()}},
        upsert=True,
    )
    return await db.channel_sync_connectors.find_one({"seller_id": user["id"], "source_type": source_type}, {"_id": 0})


@router.post("/seller/growth/connectors/{source_type}/sync", status_code=202)
async def queue_connector_sync(source_type: str, user: dict = Depends(seller_dep)):
    connector = await db.channel_sync_connectors.find_one({"seller_id": user["id"], "source_type": source_type, "enabled": True}, {"_id": 0})
    if not connector:
        raise HTTPException(404, "Enabled connector not found")
    job = {
        "id": new_id("sync_"),
        "seller_id": user["id"],
        "source_type": source_type,
        "connector_id": connector.get("id"),
        "status": "queued",
        "adapter_status": "connector_ready",
        "created_at": now_iso(),
    }
    await db.channel_sync_jobs.insert_one(dict(job))
    return job


class OrderAddressPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone: Optional[str] = Field(default=None, max_length=40)
    address: Optional[str] = Field(default=None, max_length=500)
    area: Optional[str] = Field(default=None, max_length=160)
    city: Optional[str] = Field(default=None, max_length=160)
    note: Optional[str] = Field(default=None, max_length=500)


def _edit_deadline(order, minutes):
    created = _parse_iso(order.get("created_at")) or _utcnow()
    return created + timedelta(minutes=minutes)


@router.get("/seller/growth/order-control/{order_id}")
async def order_control(order_id: str, user: dict = Depends(seller_dep)):
    order = await db.orders.find_one({"id": order_id, "seller_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    settings = await _growth_settings(user["id"])
    deadline = _edit_deadline(order, settings["order_edit_window_minutes"])
    shipment = await db.shipments.find_one({"order_id": order_id}, {"_id": 0})
    editable = order.get("status") == "pending" and not (shipment and shipment.get("tracking_code")) and (_utcnow() <= deadline or order.get("operational_hold"))
    return {
        "order_id": order_id,
        "editable": editable,
        "edit_deadline": deadline.isoformat(),
        "operational_hold": bool(order.get("operational_hold")),
        "hold_reason": order.get("operational_hold_reason"),
        "selected_courier": order.get("selected_courier"),
        "fraud_decision": order.get("fraud_decision"),
    }


@router.patch("/seller/growth/order-control/{order_id}")
async def edit_order_delivery(order_id: str, body: OrderAddressPatch, user: dict = Depends(seller_dep)):
    order = await db.orders.find_one({"id": order_id, "seller_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    control = await order_control(order_id, user)
    if not control["editable"]:
        raise HTTPException(409, "This order is locked because the edit window closed or courier booking already started")
    address = dict(order.get("delivery_address") or {})
    for key in ("phone", "address", "area", "city"):
        value = getattr(body, key)
        if value is not None:
            address[key] = value.strip()
    update = {"delivery_address": address, "updated_at": now_iso()}
    if body.note is not None:
        update["seller_order_note"] = body.note.strip()
    await db.orders.update_one({"id": order_id, "seller_id": user["id"]}, {"$set": update})
    return await db.orders.find_one({"id": order_id, "seller_id": user["id"]}, {"_id": 0})


class HoldBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(default="Seller review", min_length=2, max_length=300)


@router.post("/seller/growth/order-control/{order_id}/hold")
async def hold_order(order_id: str, body: HoldBody, user: dict = Depends(seller_dep)):
    result = await db.orders.update_one(
        {"id": order_id, "seller_id": user["id"], "status": "pending"},
        {"$set": {"operational_hold": True, "operational_hold_reason": body.reason.strip(), "updated_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(409, "Only pending orders can be placed on hold")
    return {"ok": True, "operational_hold": True}


@router.post("/seller/growth/order-control/{order_id}/release")
async def release_order(order_id: str, user: dict = Depends(seller_dep)):
    order = await db.orders.find_one({"id": order_id, "seller_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    decision = order.get("fraud_decision") or {}
    verification = order.get("fraud_verification") or {}
    if decision.get("requires_action") and verification.get("status") not in {"approve", "approved", "otp_verified", "call_verified", "advance_received"}:
        raise HTTPException(409, "Complete the fraud verification action before releasing this order")
    await db.orders.update_one(
        {"id": order_id, "seller_id": user["id"]},
        {"$set": {"operational_hold": False, "operational_hold_reason": None, "updated_at": now_iso()}},
    )
    return {"ok": True, "operational_hold": False}


@router.get("/seller/growth/overview")
async def growth_overview(user: dict = Depends(seller_dep)):
    profit = await build_profit_summary(user["id"], 30)
    courier = await courier_recommendations(user["id"])
    customers = await customer_360_rows(user["id"], 200)
    held = await db.orders.count_documents({"seller_id": user["id"], "operational_hold": True})
    return {
        "profit": profit,
        "courier": courier,
        "customer_segments": {
            "vip": sum(1 for r in customers if r["segment"] == "VIP"),
            "repeat": sum(1 for r in customers if r["segment"] == "Repeat"),
            "risk": sum(1 for r in customers if r["segment"] == "Risk"),
            "new": sum(1 for r in customers if r["segment"] == "New"),
        },
        "operational_holds": held,
        "positioning": "Protect margin, route every order intelligently, and own the customer relationship.",
    }
