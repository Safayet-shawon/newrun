from datetime import datetime, timezone, timedelta
from typing import Literal, Optional, List
import os, re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from db import db, new_id, now_iso
from security import require_role
from entitlements import PLANS, PLAN_ORDER, PLAN_FEATURES, get_plan, get_entitlements
from admin import audit, get_platform_settings

router = APIRouter(); admin_dep = require_role("admin"); seller_dep = require_role("seller"); PLAN_IDS = tuple(PLAN_ORDER)


def utcnow(): return datetime.now(timezone.utc)

def parse_iso(value):
    if not value: return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception: return None

def normalize(code): return code.strip().upper()


async def ensure_indexes():
    await db.subscription_tokens.create_index("code", unique=True)
    await db.subscription_tokens.create_index([("created_at", -1)])
    await db.subscription_token_redemptions.create_index([("token_id", 1), ("seller_id", 1)])
    await db.subscription_token_redemptions.create_index([("redeemed_at", -1)])


async def seller_context_with_expiry(user: dict):
    profile = await db.seller_profiles.find_one({"user_id": user["id"]}, {"_id": 0}); shop = await db.shops.find_one({"seller_id": user["id"]}, {"_id": 0}); sub = await db.subscriptions.find_one({"seller_id": user["id"]}, {"_id": 0}); plan_id = "free"
    if sub and sub.get("status") in ("active", "active_dev"):
        expiry = parse_iso(sub.get("expires_at"))
        if expiry and expiry <= utcnow():
            await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"status": "expired", "updated_at": now_iso()}}); sub["status"] = "expired"
        else: plan_id = sub.get("plan", "free")
    return profile, shop, sub, plan_id


def install_seller_expiry_guard(seller_module): seller_module._seller_context = seller_context_with_expiry


class TokenBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=3, max_length=40); token_type: Literal["discount", "free_access"]
    applicable_plans: List[Literal["start", "grow", "pro"]]
    discount_type: Optional[Literal["percentage", "fixed"]] = None; discount_value: Optional[float] = Field(default=None, ge=0)
    free_access_days: Optional[int] = Field(default=None, ge=1, le=3650); max_uses: Optional[int] = Field(default=1, ge=1)
    per_seller_limit: Optional[int] = Field(default=1, ge=1); redeem_within_days: Optional[int] = Field(default=None, ge=1, le=3650)
    is_active: bool = True

class TokenStatusBody(BaseModel): is_active: bool
class TokenPreviewBody(BaseModel): code: str; plan: Literal["start", "grow", "pro"]


def build_token(body: TokenBody):
    code = normalize(body.code)
    if not re.fullmatch(r"[A-Z0-9_-]+", code): raise HTTPException(422, "Token code may only contain letters, numbers, - and _")
    if not body.applicable_plans: raise HTTPException(422, "Select at least one plan")
    if body.token_type == "discount":
        if not body.discount_type or body.discount_value is None or body.discount_value <= 0: raise HTTPException(422, "Choose a valid discount")
        if body.discount_type == "percentage" and body.discount_value > 100: raise HTTPException(422, "Percentage discount cannot exceed 100%")
    if body.token_type == "free_access" and not body.free_access_days: raise HTTPException(422, "Free access duration is required")
    return {"code": code, "token_type": body.token_type, "applicable_plans": list(dict.fromkeys(body.applicable_plans)),
            "discount_type": body.discount_type if body.token_type == "discount" else None,
            "discount_value": body.discount_value if body.token_type == "discount" else None,
            "free_access_days": body.free_access_days if body.token_type == "free_access" else None,
            "max_uses": body.max_uses, "per_seller_limit": body.per_seller_limit, "redeem_within_days": body.redeem_within_days,
            "redeem_before": (utcnow() + timedelta(days=body.redeem_within_days)).isoformat() if body.redeem_within_days else None,
            "is_active": body.is_active}


@router.get("/admin/nexora/tokens")
async def list_tokens(user=Depends(admin_dep)): return await db.subscription_tokens.find({}, {"_id": 0}).sort([("created_at", -1)]).to_list(3000)

@router.post("/admin/nexora/tokens")
async def create_token(body: TokenBody, user=Depends(admin_dep)):
    data = build_token(body)
    if await db.subscription_tokens.find_one({"code": data["code"]}): raise HTTPException(409, "This token code already exists")
    item = {"id": new_id("token_"), **data, "used_count": 0, "created_at": now_iso(), "updated_at": now_iso(), "created_by": user["id"]}
    await db.subscription_tokens.insert_one(dict(item)); await audit(user, "admin.subscription_token.created", item["id"], {"code": item["code"], "token_type": item["token_type"]}); return item

@router.put("/admin/nexora/tokens/{token_id}")
async def edit_token(token_id: str, body: TokenBody, user=Depends(admin_dep)):
    if not await db.subscription_tokens.find_one({"id": token_id}): raise HTTPException(404, "Token not found")
    data = build_token(body)
    if await db.subscription_tokens.find_one({"code": data["code"], "id": {"$ne": token_id}}): raise HTTPException(409, "This token code already exists")
    data.update({"updated_at": now_iso(), "updated_by": user["id"]}); await db.subscription_tokens.update_one({"id": token_id}, {"$set": data}); await audit(user, "admin.subscription_token.updated", token_id, {"code": data["code"]})
    return await db.subscription_tokens.find_one({"id": token_id}, {"_id": 0})

@router.patch("/admin/nexora/tokens/{token_id}/status")
async def token_status(token_id: str, body: TokenStatusBody, user=Depends(admin_dep)):
    result = await db.subscription_tokens.update_one({"id": token_id}, {"$set": {"is_active": body.is_active, "updated_at": now_iso(), "updated_by": user["id"]}})
    if not result.matched_count: raise HTTPException(404, "Token not found")
    await audit(user, "admin.subscription_token.status", token_id, {"is_active": body.is_active}); return {"ok": True, "is_active": body.is_active}

@router.get("/admin/nexora/tokens/{token_id}/redemptions")
async def token_redemptions(token_id: str, user=Depends(admin_dep)): return await db.subscription_token_redemptions.find({"token_id": token_id}, {"_id": 0}).sort([("redeemed_at", -1)]).to_list(3000)


async def token_quote(code: str, plan: str, seller_id: str):
    token = await db.subscription_tokens.find_one({"code": normalize(code)}, {"_id": 0})
    if not token: raise HTTPException(404, "Invalid subscription token")
    if not token.get("is_active"): raise HTTPException(400, "This token has been disabled")
    if plan not in token.get("applicable_plans", []): raise HTTPException(400, "This token is not valid for this plan")
    deadline = parse_iso(token.get("redeem_before"))
    if deadline and deadline <= utcnow(): raise HTTPException(400, "This token has expired")
    if token.get("max_uses") is not None and token.get("used_count", 0) >= token["max_uses"]: raise HTTPException(400, "This token has reached its usage limit")
    if token.get("per_seller_limit") is not None:
        used = await db.subscription_token_redemptions.count_documents({"token_id": token["id"], "seller_id": seller_id})
        if used >= token["per_seller_limit"]: raise HTTPException(400, "You have reached your usage limit for this token")
    settings = await get_platform_settings(); price = float(settings["plans"][plan]["price_bdt"])
    if token["token_type"] == "free_access": discount = price
    elif token["discount_type"] == "percentage": discount = min(price, price * float(token["discount_value"]) / 100)
    else: discount = min(price, float(token["discount_value"]))
    return {"token": token, "plan": plan, "original_price_bdt": round(price, 2), "discount_bdt": round(discount, 2), "payable_bdt": round(max(0, price - discount), 2)}


async def consume_token(quote: dict, seller_id: str, shop_id: Optional[str], require_active=True):
    token = quote["token"]
    if token.get("per_seller_limit") is not None:
        used = await db.subscription_token_redemptions.count_documents({"token_id": token["id"], "seller_id": seller_id})
        if used >= token["per_seller_limit"]: raise HTTPException(409, "Seller token limit reached")
    query = {"id": token["id"]}
    if require_active: query["is_active"] = True
    if token.get("max_uses") is not None: query["used_count"] = {"$lt": token["max_uses"]}
    result = await db.subscription_tokens.update_one(query, {"$inc": {"used_count": 1}, "$set": {"updated_at": now_iso()}})
    if not result.matched_count: raise HTTPException(409, "Token is no longer available")
    red = {"id": new_id("redeem_"), "token_id": token["id"], "token_code": token["code"], "seller_id": seller_id, "shop_id": shop_id,
           "plan": quote["plan"], "token_type": token["token_type"], "original_price_bdt": quote["original_price_bdt"],
           "discount_bdt": quote["discount_bdt"], "payable_bdt": quote["payable_bdt"], "free_access_days": token.get("free_access_days"), "redeemed_at": now_iso()}
    await db.subscription_token_redemptions.insert_one(dict(red)); return red


async def rollback_redemption(red):
    if not red: return
    await db.subscription_token_redemptions.delete_one({"id": red["id"]}); await db.subscription_tokens.update_one({"id": red["token_id"], "used_count": {"$gt": 0}}, {"$inc": {"used_count": -1}})


async def consume_pending_token(sub: dict, shop_id: Optional[str]):
    token = await db.subscription_tokens.find_one({"id": sub.get("pending_token_id")}, {"_id": 0})
    if not token: raise HTTPException(409, "Pending token no longer exists")
    quote = {"token": token, "plan": sub["plan"], "original_price_bdt": float(sub.get("original_price_bdt", 0)), "discount_bdt": float(sub.get("discount_bdt", 0)), "payable_bdt": float(sub.get("payable_bdt", 0))}
    return await consume_token(quote, sub["seller_id"], shop_id, require_active=False)


@router.get("/seller/subscription-plans")
async def seller_subscription_plans(user=Depends(seller_dep)):
    settings = await get_platform_settings(); plans = []
    for pid in PLAN_ORDER:
        cfg = settings.get("plans", {}).get(pid, {}); plan = {**PLANS[pid]}; plan["name"] = cfg.get("name", plan.get("name")); plan["price_bdt"] = cfg.get("price_bdt", plan.get("price_bdt", 0)); plans.append(plan)
    return {"plans": plans, "features": PLAN_FEATURES}

@router.post("/seller/subscription-token/preview")
async def preview(body: TokenPreviewBody, user=Depends(seller_dep)):
    q = await token_quote(body.code, body.plan, user["id"]); t = q["token"]
    return {"valid": True, "code": t["code"], "token_type": t["token_type"], "discount_type": t.get("discount_type"), "discount_value": t.get("discount_value"), "free_access_days": t.get("free_access_days"), "original_price_bdt": q["original_price_bdt"], "discount_bdt": q["discount_bdt"], "payable_bdt": q["payable_bdt"]}

@router.post("/seller/subscription-token/redeem")
async def redeem(body: TokenPreviewBody, user=Depends(seller_dep)):
    q = await token_quote(body.code, body.plan, user["id"]); token = q["token"]; shop = await db.shops.find_one({"seller_id": user["id"]}, {"_id": 0}); dev = os.getenv("ALLOW_DEV_SUBSCRIPTIONS", "false").lower() == "true"
    if token["token_type"] == "discount" and not dev:
        await db.subscriptions.update_one({"seller_id": user["id"]}, {"$set": {"plan": body.plan, "status": "pending_payment", "pending_token_id": token["id"], "pending_token_code": token["code"], "original_price_bdt": q["original_price_bdt"], "discount_bdt": q["discount_bdt"], "payable_bdt": q["payable_bdt"], "subscription_source": "discount_token", "updated_at": now_iso()}, "$setOnInsert": {"id": new_id("sub_"), "seller_id": user["id"], "started_at": now_iso(), "created_at": now_iso()}}, upsert=True)
        return {"ok": True, "status": "pending_payment", "requires_payment": True, "plan": get_plan(body.plan), **{k: q[k] for k in ("original_price_bdt", "discount_bdt", "payable_bdt")}, "token": {"code": token["code"], "token_type": token["token_type"]}}
    red = await consume_token(q, user["id"], (shop or {}).get("id")); start = utcnow(); expiry = start + timedelta(days=int(token["free_access_days"])) if token["token_type"] == "free_access" else start + timedelta(days=30); status = "active" if token["token_type"] == "free_access" else "active_dev"
    try:
        old = await db.subscriptions.find_one({"seller_id": user["id"]}, {"_id": 0}); sub_id = (old or {}).get("id") or new_id("sub_")
        await db.subscriptions.update_one({"seller_id": user["id"]}, {"$set": {"id": sub_id, "plan": body.plan, "status": status, "started_at": (old or {}).get("started_at") or start.isoformat(), "current_period_started_at": start.isoformat(), "expires_at": expiry.isoformat(), "token_id": token["id"], "token_code": token["code"], "original_price_bdt": q["original_price_bdt"], "discount_bdt": q["discount_bdt"], "payable_bdt": q["payable_bdt"], "amount_paid": q["payable_bdt"], "subscription_source": "free_access_token" if token["token_type"] == "free_access" else "discount_token", "updated_at": now_iso()}, "$setOnInsert": {"created_at": now_iso()}}, upsert=True)
    except Exception:
        await rollback_redemption(red); raise
    return {"ok": True, "status": status, "requires_payment": False, "plan": get_plan(body.plan), "entitlements": get_entitlements(body.plan), **{k: q[k] for k in ("original_price_bdt", "discount_bdt", "payable_bdt")}, "expires_at": expiry.isoformat(), "token": {"code": token["code"], "token_type": token["token_type"], "free_access_days": token.get("free_access_days")}}
