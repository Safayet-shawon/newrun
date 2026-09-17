from datetime import datetime, timezone, timedelta
from typing import Literal
import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from pymongo.errors import DuplicateKeyError

from db import db, client, new_id, now_iso
from security import require_role
from entitlements import PLANS, PLAN_ORDER
from admin import get_platform_settings
from wallet import ensure_wallet, debit_wallet, mode as wallet_mode

router = APIRouter()
seller_dep = require_role("seller")


class SubscriptionPaymentBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan: Literal["start", "grow", "pro"]
    idempotency_key: str = Field(min_length=16, max_length=100)


class ScheduledChangeBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan: Literal["free", "start", "grow", "pro"]


def _parse_iso(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def subscription_period(current: dict | None, target_plan: str, now: datetime) -> tuple[str, datetime, datetime]:
    current = current or {}
    existing_expiry = _parse_iso(current.get("expires_at"))
    active = bool(current.get("status") in {"active", "active_dev"} and existing_expiry and existing_expiry > now)
    if active and PLAN_ORDER.index(target_plan) < PLAN_ORDER.index(current.get("plan", "free")):
        raise ValueError("Downgrades are not charged mid-cycle. Schedule the lower plan for period end.")
    same_plan = bool(active and current.get("plan") == target_plan)
    start = existing_expiry if same_plan else now
    transition = "renewal" if same_plan else "upgrade" if active else "activation"
    return transition, start, start + timedelta(days=30)


async def _consume_pending_token(sub: dict, seller_id: str, shop_id: str | None, session):
    token_id = sub.get("pending_token_id")
    if not token_id:
        return None
    token = await db.subscription_tokens.find_one({"id": token_id}, session=session)
    if not token:
        raise HTTPException(409, "The accepted subscription token no longer exists")
    if token.get("per_seller_limit") is not None:
        used = await db.subscription_token_redemptions.count_documents({"token_id": token_id, "seller_id": seller_id}, session=session)
        if used >= int(token["per_seller_limit"]):
            raise HTTPException(409, "Seller token limit reached")
    query = {"id": token_id}
    if token.get("max_uses") is not None:
        query["used_count"] = {"$lt": int(token["max_uses"])}
    changed = await db.subscription_tokens.update_one(query, {"$inc": {"used_count": 1}, "$set": {"updated_at": now_iso()}}, session=session)
    if changed.matched_count != 1:
        raise HTTPException(409, "This subscription token is no longer available")
    redemption = {
        "id": new_id("redeem_"),
        "token_id": token_id,
        "token_code": token.get("code"),
        "seller_id": seller_id,
        "shop_id": shop_id,
        "plan": sub["plan"],
        "token_type": token.get("token_type"),
        "original_price_bdt": float(sub.get("original_price_bdt", 0) or 0),
        "discount_bdt": float(sub.get("discount_bdt", 0) or 0),
        "payable_bdt": float(sub.get("payable_bdt", 0) or 0),
        "free_access_days": token.get("free_access_days"),
        "redeemed_at": now_iso(),
    }
    await db.subscription_token_redemptions.insert_one(dict(redemption), session=session)
    return redemption


@router.get("/seller/subscription/billing")
async def billing_status(user=Depends(seller_dep)):
    await ensure_wallet(user["id"])
    settings = await get_platform_settings()
    sub = await db.subscriptions.find_one({"seller_id": user["id"]}, {"_id": 0})
    wallet = await db.wallets.find_one({"user_id": user["id"], "mode": wallet_mode()}, {"_id": 0})
    plans = {
        pid: {
            "price_bdt": float((settings.get("plans") or {}).get(pid, {}).get("price_bdt", PLANS[pid]["price_bdt"])),
            "name": (settings.get("plans") or {}).get(pid, {}).get("name", PLANS[pid]["name"]),
        }
        for pid in PLANS
    }
    return {
        "subscription": sub,
        "wallet_balance_paisa": int((wallet or {}).get("balance_paisa", 0) or 0),
        "wallet_mode": wallet_mode(),
        "plans": plans,
        "policy": {
            "period_days": 30,
            "renewal": "Same-plan payments extend the current expiry by 30 days.",
            "upgrade": "Upgrades start immediately for a new 30-day period; unused time is not prorated.",
            "downgrade": "Downgrades are scheduled for the current period end and are never charged automatically.",
        },
    }


@router.put("/seller/subscription/scheduled-change")
async def schedule_change(body: ScheduledChangeBody, user=Depends(seller_dep)):
    current = await db.subscriptions.find_one({"seller_id": user["id"]}, {"_id": 0})
    now = datetime.now(timezone.utc)
    expiry = _parse_iso((current or {}).get("expires_at"))
    if not current or current.get("status") not in {"active", "active_dev"} or not expiry or expiry <= now:
        if body.plan == "free":
            await db.subscriptions.update_one(
                {"seller_id": user["id"]},
                {"$set": {"plan": "free", "status": "active", "updated_at": now_iso()}, "$setOnInsert": {"id": new_id("sub_"), "created_at": now_iso(), "started_at": now_iso()}},
                upsert=True,
            )
            return {"ok": True, "status": "active", "plan": "free"}
        raise HTTPException(409, "Choose and pay for this plan to activate it")
    if PLAN_ORDER.index(body.plan) >= PLAN_ORDER.index(current.get("plan", "free")):
        raise HTTPException(409, "Only a lower plan can be scheduled; upgrades are activated by wallet payment")
    await db.subscriptions.update_one(
        {"id": current["id"]},
        {"$set": {"scheduled_plan": body.plan, "scheduled_for": expiry.isoformat(), "auto_renew": False, "updated_at": now_iso()}},
    )
    return {"ok": True, "status": "scheduled", "plan": body.plan, "effective_at": expiry.isoformat()}


@router.delete("/seller/subscription/scheduled-change")
async def cancel_scheduled_change(user=Depends(seller_dep)):
    await db.subscriptions.update_one({"seller_id": user["id"]}, {"$unset": {"scheduled_plan": "", "scheduled_for": ""}, "$set": {"updated_at": now_iso()}})
    return {"ok": True}


@router.post("/seller/subscription/pay-wallet")
async def pay_subscription(body: SubscriptionPaymentBody, user=Depends(seller_dep)):
    if body.plan not in PLANS:
        raise HTTPException(422, "Invalid subscription plan")
    await ensure_wallet(user["id"])
    settings = await get_platform_settings()
    regular_price = float((settings.get("plans") or {}).get(body.plan, {}).get("price_bdt", PLANS[body.plan]["price_bdt"]))
    shop = await db.shops.find_one({"seller_id": user["id"]}, {"_id": 0})
    if not shop:
        raise HTTPException(400, "Complete seller onboarding before subscribing")

    request_digest = hashlib.sha256(json.dumps({"plan": body.plan}, sort_keys=True).encode()).hexdigest()
    payment_identity = {"seller_id": user["id"], "idempotency_key": body.idempotency_key}
    previous = await db.subscription_payments.find_one(payment_identity, {"_id": 0})
    if previous:
        if previous.get("digest") != request_digest:
            raise HTTPException(409, "This payment key was already used for another plan")
        if previous.get("status") == "completed":
            return {**previous["response"], "replayed": True}
        raise HTTPException(409, "This subscription payment is already being processed")

    async def commit(session):
        current = await db.subscriptions.find_one({"seller_id": user["id"]}, {"_id": 0}, session=session)
        payment_id = new_id("subpay_")
        await db.subscription_payments.insert_one({
            **payment_identity, "id": payment_id, "digest": request_digest, "plan": body.plan,
            "status": "processing", "created_at": now_iso(),
        }, session=session)
        pending = (current or {}).get("pending_purchase") or current or {}
        pending_discount = bool(
            pending.get("plan") == body.plan
            and pending.get("pending_token_id")
        )
        payable_bdt = float(pending.get("payable_bdt", regular_price) if pending_discount else regular_price)
        if payable_bdt < 0:
            raise HTTPException(409, "Invalid subscription amount")
        payable_paisa = int(round(payable_bdt * 100))
        reference = payment_id
        if payable_paisa:
            await debit_wallet(user["id"], payable_paisa, reference, session)
            await db.wallet_ledger.update_one(
                {"reference": reference, "user_id": user["id"]},
                {"$set": {"description": f"Nexora {body.plan.upper()} subscription", "resource_type": "subscription", "plan": body.plan}},
                session=session,
            )
        if pending_discount:
            await _consume_pending_token({**pending, "seller_id": user["id"]}, user["id"], shop.get("id"), session)

        now = datetime.now(timezone.utc)
        try:
            transition, period_start, expiry = subscription_period(current, body.plan, now)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        sub_id = (current or {}).get("id") or new_id("sub_")
        update = {
            "id": sub_id,
            "seller_id": user["id"],
            "plan": body.plan,
            "status": "active",
            "current_period_started_at": period_start.isoformat(),
            "expires_at": expiry.isoformat(),
            "original_price_bdt": float(pending.get("original_price_bdt", regular_price) if pending_discount else regular_price),
            "discount_bdt": float(pending.get("discount_bdt", 0) if pending_discount else 0),
            "payable_bdt": payable_bdt,
            "amount_paid": payable_bdt,
            "payment_method": "nexora_wallet",
            "payment_reference": reference if payable_paisa else None,
            "payment_mode": wallet_mode(),
            "subscription_source": "wallet_token" if pending_discount else "wallet",
            "updated_at": now_iso(),
        }
        await db.subscriptions.update_one(
            {"seller_id": user["id"]},
            {
                "$set": update,
                "$setOnInsert": {"created_at": now_iso(), "started_at": now.isoformat()},
                "$unset": {"pending_token_id": "", "pending_token_code": "", "pending_purchase": "", "scheduled_plan": "", "scheduled_for": ""},
            },
            upsert=True,
            session=session,
        )
        await db.audit_events.insert_one({
            "id": new_id("audit_"),
            "actor_id": user["id"],
            "action": "seller.subscription.paid",
            "resource_id": sub_id,
            "changes": {"plan": body.plan, "amount_bdt": payable_bdt, "method": "nexora_wallet"},
            "created_at": now_iso(),
        }, session=session)
        response = {"ok": True, "status": "active", "plan": body.plan, "amount_paid_bdt": payable_bdt, "expires_at": expiry.isoformat(), "transition": transition, "replayed": False}
        await db.subscription_payments.update_one(payment_identity, {"$set": {"status": "completed", "response": response, "completed_at": now_iso()}}, session=session)
        return response

    try:
        async with await client.start_session() as session:
            return await session.with_transaction(commit)
    except DuplicateKeyError:
        previous = await db.subscription_payments.find_one(payment_identity, {"_id": 0})
        if previous and previous.get("digest") == request_digest and previous.get("status") == "completed":
            return {**previous["response"], "replayed": True}
        raise HTTPException(409, "This subscription payment is already being processed")
