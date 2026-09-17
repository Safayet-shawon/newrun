"""Production operations for courier booking, customer verification and seller settlements.

External integrations are fail-closed: no provider call is simulated when credentials are
missing. Seller courier credentials are encrypted at rest with INTEGRATION_ENCRYPTION_SECRET.
"""
import asyncio
import base64
import hashlib
import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import requests
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from db import db, client, new_id, now_iso
from security import require_role
import growth_os
import wallet

router = APIRouter()
seller_dep = require_role("seller")
admin_dep = require_role("admin")

PROVIDERS = ("pathao", "steadfast", "redx")
PATHAO_BASE = os.getenv("PATHAO_API_BASE", "https://api-hermes.pathao.com").rstrip("/")
STEADFAST_BASE = os.getenv("STEADFAST_API_BASE", "https://portal.packzy.com/api/v1").rstrip("/")
REDX_BASE = os.getenv("REDX_API_BASE", "https://openapi.redx.com.bd/v1.0.0-beta").rstrip("/")
TERMINAL_ORDER_STATUSES = {"delivered", "completed", "cancelled", "canceled", "returned", "refunded"}


def _utcnow():
    return datetime.now(timezone.utc)


def _fernet():
    secret = os.getenv("INTEGRATION_ENCRYPTION_SECRET", "")
    if not secret:
        raise HTTPException(503, "Integration encryption is not configured")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def _encrypt_json(value: dict) -> str:
    return _fernet().encrypt(json.dumps(value, separators=(",", ":")).encode("utf-8")).decode("utf-8")


def _decrypt_json(value: str) -> dict:
    try:
        raw = _fernet().decrypt(str(value or "").encode("utf-8"))
        result = json.loads(raw.decode("utf-8"))
        if not isinstance(result, dict):
            raise ValueError()
        return result
    except (InvalidToken, ValueError, json.JSONDecodeError):
        raise HTTPException(503, "Stored integration credentials could not be decrypted")


def _mask(value: str, keep: int = 4):
    value = str(value or "")
    if not value:
        return None
    return "•" * max(4, len(value) - keep) + value[-keep:]


def _digits(value):
    return re.sub(r"\D+", "", str(value or ""))


def _order_amount_bdt(order):
    if order.get("total_paisa") is not None:
        return round(int(order.get("total_paisa") or 0) / 100, 2)
    return round(float(order.get("total") or 0), 2)


def _blocking_request(method: str, url: str, *, headers=None, json_body=None, data=None, timeout=22):
    try:
        response = requests.request(
            method,
            url,
            headers=headers or {},
            json=json_body,
            data=data,
            timeout=timeout,
        )
    except requests.RequestException:
        raise HTTPException(503, "Courier provider could not be reached")
    try:
        payload = response.json()
    except ValueError:
        payload = None
    if response.status_code >= 400:
        detail = "Courier provider rejected the request"
        if isinstance(payload, dict):
            candidate = payload.get("message") or payload.get("error") or payload.get("detail")
            if isinstance(candidate, str) and candidate.strip():
                detail = candidate.strip()[:240]
        raise HTTPException(502, detail)
    return payload if isinstance(payload, (dict, list)) else {}


async def ensure_indexes():
    await db.courier_connections.create_index([("seller_id", 1), ("provider", 1)], unique=True)
    await db.shipments.create_index("order_id", unique=True, sparse=True)
    await db.shipments.create_index([("provider", 1), ("external_reference", 1)], sparse=True)
    await db.order_verification_challenges.create_index("token_hash", unique=True)
    await db.order_verification_challenges.create_index("expires_at", expireAfterSeconds=0)
    await db.settlements.create_index("order_id", unique=True)
    await db.settlements.create_index([("seller_id", 1), ("status", 1), ("created_at", -1)])


class CourierConnectionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_id: Optional[str] = Field(default=None, max_length=300)
    client_secret: Optional[str] = Field(default=None, max_length=500)
    username: Optional[str] = Field(default=None, max_length=300)
    password: Optional[str] = Field(default=None, max_length=500)
    store_id: Optional[str] = Field(default=None, max_length=120)
    api_key: Optional[str] = Field(default=None, max_length=500)
    secret_key: Optional[str] = Field(default=None, max_length=500)
    access_token: Optional[str] = Field(default=None, max_length=2000)
    pickup_store_id: Optional[str] = Field(default=None, max_length=120)


def _credential_payload(provider: str, body: CourierConnectionBody):
    raw = body.model_dump(exclude_none=True)
    allowed = {
        "pathao": {"client_id", "client_secret", "username", "password", "store_id"},
        "steadfast": {"api_key", "secret_key"},
        "redx": {"access_token", "pickup_store_id"},
    }[provider]
    payload = {k: str(v).strip() for k, v in raw.items() if k in allowed and str(v).strip()}
    required = {
        "pathao": {"client_id", "client_secret", "username", "password"},
        "steadfast": {"api_key", "secret_key"},
        "redx": {"access_token"},
    }[provider]
    missing = sorted(required - set(payload))
    if missing:
        raise HTTPException(422, f"Missing {provider} credentials: {', '.join(missing)}")
    return payload


async def _connection(seller_id: str, provider: str, *, required=True):
    row = await db.courier_connections.find_one({"seller_id": seller_id, "provider": provider}, {"_id": 0})
    if not row or row.get("status") != "connected":
        if required:
            raise HTTPException(409, f"Connect {provider.title()} before booking")
        return None, None
    return row, _decrypt_json(row["credentials_enc"])


async def _pathao_token(creds: dict):
    result = await run_in_threadpool(
        _blocking_request,
        "POST",
        f"{PATHAO_BASE}/aladdin/api/v1/issue-token",
        json_body={
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
            "username": creds["username"],
            "password": creds["password"],
            "grant_type": "password",
        },
    )
    token = result.get("access_token") if isinstance(result, dict) else None
    if not token:
        raise HTTPException(502, "Pathao did not return an access token")
    return token


async def _test_provider(provider: str, creds: dict):
    if provider == "pathao":
        token = await _pathao_token(creds)
        stores = await run_in_threadpool(
            _blocking_request, "GET", f"{PATHAO_BASE}/aladdin/api/v1/stores",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        return {"ok": True, "provider": provider, "store_count": len((stores or {}).get("data") or []) if isinstance(stores, dict) else 0}
    if provider == "steadfast":
        result = await run_in_threadpool(
            _blocking_request, "GET", f"{STEADFAST_BASE}/get_balance",
            headers={"Api-Key": creds["api_key"], "Secret-Key": creds["secret_key"], "Accept": "application/json"},
        )
        return {"ok": True, "provider": provider, "balance": result.get("current_balance") if isinstance(result, dict) else None}
    result = await run_in_threadpool(
        _blocking_request, "GET", f"{REDX_BASE}/pickup/stores",
        headers={"API-ACCESS-TOKEN": f"Bearer {creds['access_token']}", "Accept": "application/json"},
    )
    rows = result.get("data") if isinstance(result, dict) else result
    return {"ok": True, "provider": provider, "pickup_store_count": len(rows or []) if isinstance(rows, list) else 0}


@router.get("/seller/integrations/couriers")
async def courier_connections(user: dict = Depends(seller_dep)):
    rows = await db.courier_connections.find({"seller_id": user["id"]}, {"_id": 0, "credentials_enc": 0}).to_list(20)
    by_provider = {row["provider"]: row for row in rows}
    return {
        provider: {
            "provider": provider,
            "status": (by_provider.get(provider) or {}).get("status", "not_connected"),
            "last_tested_at": (by_provider.get(provider) or {}).get("last_tested_at"),
            "masked_account": (by_provider.get(provider) or {}).get("masked_account"),
            "updated_at": (by_provider.get(provider) or {}).get("updated_at"),
        }
        for provider in PROVIDERS
    }


@router.put("/seller/integrations/couriers/{provider}")
async def save_courier_connection(provider: str, body: CourierConnectionBody, user: dict = Depends(seller_dep)):
    provider = provider.lower()
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unsupported courier")
    payload = _credential_payload(provider, body)
    test = await _test_provider(provider, payload)
    masked_account = _mask(payload.get("username") or payload.get("api_key") or payload.get("access_token"))
    record = {
        "seller_id": user["id"], "provider": provider, "status": "connected",
        "credentials_enc": _encrypt_json(payload), "masked_account": masked_account,
        "last_tested_at": now_iso(), "updated_at": now_iso(),
    }
    await db.courier_connections.update_one(
        {"seller_id": user["id"], "provider": provider},
        {"$set": record, "$setOnInsert": {"id": new_id("cour_"), "created_at": now_iso()}}, upsert=True,
    )
    await db.courier_profiles.update_one(
        {"seller_id": user["id"]},
        {"$set": {f"providers.{provider}.connection_status": "connected", "updated_at": now_iso()}}, upsert=True,
    )
    return {"ok": True, "provider": provider, "status": "connected", "test": test, "masked_account": masked_account}


@router.post("/seller/integrations/couriers/{provider}/test")
async def test_courier_connection(provider: str, user: dict = Depends(seller_dep)):
    provider = provider.lower()
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unsupported courier")
    _, creds = await _connection(user["id"], provider)
    result = await _test_provider(provider, creds)
    await db.courier_connections.update_one(
        {"seller_id": user["id"], "provider": provider},
        {"$set": {"last_tested_at": now_iso(), "last_test_result": "ok", "updated_at": now_iso()}},
    )
    return result


@router.delete("/seller/integrations/couriers/{provider}")
async def disconnect_courier(provider: str, user: dict = Depends(seller_dep)):
    provider = provider.lower()
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unsupported courier")
    await db.courier_connections.delete_one({"seller_id": user["id"], "provider": provider})
    await db.courier_profiles.update_one(
        {"seller_id": user["id"]},
        {"$set": {f"providers.{provider}.connection_status": "not_connected", "updated_at": now_iso()}},
    )
    return {"ok": True, "provider": provider, "status": "not_connected"}


def _safe_provider_status(provider: str, payload):
    if not isinstance(payload, dict):
        return "unknown"
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    raw = str(
        data.get("order_status") or data.get("delivery_status") or data.get("status") or
        data.get("parcel_status") or data.get("current_status") or "unknown"
    ).lower().replace("-", " ").replace("_", " ")
    if any(x in raw for x in ("deliver", "completed", "complete")):
        return "delivered"
    if any(x in raw for x in ("return", "rto")):
        return "returned"
    if any(x in raw for x in ("cancel", "reject")):
        return "cancelled"
    if any(x in raw for x in ("transit", "on the way", "out for delivery", "delivery ongoing")):
        return "in_transit"
    if any(x in raw for x in ("pick", "received at", "hub", "warehouse")):
        return "picked_up"
    if any(x in raw for x in ("fail", "hold")):
        return "failed"
    return "pickup_requested"


def _recipient(order):
    addr = order.get("delivery_address") or {}
    return {
        "name": str(order.get("customer_name") or addr.get("full_name") or "Customer")[:100],
        "phone": _digits(addr.get("phone"))[-11:],
        "address": " ".join(str(x or "").strip() for x in (addr.get("address"), addr.get("area"), addr.get("city")) if str(x or "").strip())[:500],
        "area": str(addr.get("area") or addr.get("city") or "").strip(),
        "city": str(addr.get("city") or "").strip(),
    }


async def _redx_area_id(creds: dict, recipient: dict):
    result = await run_in_threadpool(
        _blocking_request, "GET", f"{REDX_BASE}/areas",
        headers={"API-ACCESS-TOKEN": f"Bearer {creds['access_token']}", "Accept": "application/json"},
    )
    rows = result.get("areas") or result.get("data") if isinstance(result, dict) else result
    if not isinstance(rows, list):
        rows = []
    needle = (recipient.get("area") or recipient.get("city") or "").lower()
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or row.get("area_name") or row.get("zone_name") or "").lower()
        if needle and (needle in name or name in needle):
            return row.get("id") or row.get("area_id"), row.get("name") or row.get("area_name") or recipient.get("area")
    if rows:
        row = rows[0]
        return row.get("id") or row.get("area_id"), row.get("name") or row.get("area_name") or recipient.get("area")
    raise HTTPException(422, "RedX could not resolve a delivery area for this address")


async def _book_provider(provider: str, order: dict, seller_id: str, creds: dict):
    recipient = _recipient(order)
    if len(recipient["phone"]) < 10 or not recipient["address"]:
        raise HTTPException(422, "Complete customer phone and delivery address before courier booking")
    amount = _order_amount_bdt(order) if order.get("payment_method") == "cash_on_delivery" else 0
    instruction = str(order.get("seller_order_note") or "")[:300]
    item_qty = sum(max(1, int(i.get("qty") or 1)) for i in (order.get("items") or [])) or 1
    item_desc = ", ".join(str(i.get("title") or "Item") for i in (order.get("items") or [])[:5])[:300]

    if provider == "pathao":
        token = await _pathao_token(creds)
        store_id = creds.get("store_id")
        if not store_id:
            stores = await run_in_threadpool(
                _blocking_request, "GET", f"{PATHAO_BASE}/aladdin/api/v1/stores",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            )
            rows = stores.get("data") if isinstance(stores, dict) else None
            if isinstance(rows, list) and rows:
                store_id = rows[0].get("store_id") or rows[0].get("id")
        if not store_id:
            raise HTTPException(422, "Pathao store ID could not be resolved")
        payload = {
            "store_id": int(store_id) if str(store_id).isdigit() else store_id,
            "merchant_order_id": order["id"],
            "recipient_name": recipient["name"], "recipient_phone": recipient["phone"],
            "recipient_address": recipient["address"], "delivery_type": 48, "item_type": 2,
            "item_quantity": item_qty, "item_weight": 0.5, "amount_to_collect": amount,
            "special_instruction": instruction, "item_description": item_desc,
        }
        result = await run_in_threadpool(
            _blocking_request, "POST", f"{PATHAO_BASE}/aladdin/api/v1/orders",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json"},
            json_body=payload,
        )
        data = result.get("data") if isinstance(result, dict) and isinstance(result.get("data"), dict) else result
        reference = str((data or {}).get("consignment_id") or (data or {}).get("tracking_code") or (data or {}).get("id") or "")
        if not reference:
            raise HTTPException(502, "Pathao created no usable consignment reference")
        return reference, result

    if provider == "steadfast":
        payload = {
            "invoice": order["id"], "recipient_name": recipient["name"], "recipient_phone": recipient["phone"],
            "recipient_address": recipient["address"], "cod_amount": amount, "note": instruction or item_desc,
        }
        result = await run_in_threadpool(
            _blocking_request, "POST", f"{STEADFAST_BASE}/create_order",
            headers={"Api-Key": creds["api_key"], "Secret-Key": creds["secret_key"], "Content-Type": "application/json", "Accept": "application/json"},
            json_body=payload,
        )
        consignment = result.get("consignment") if isinstance(result, dict) and isinstance(result.get("consignment"), dict) else result
        reference = str((consignment or {}).get("tracking_code") or (consignment or {}).get("consignment_id") or (consignment or {}).get("id") or "")
        if not reference:
            raise HTTPException(502, "Steadfast created no usable tracking reference")
        return reference, result

    area_id, area_name = await _redx_area_id(creds, recipient)
    pickup_store_id = creds.get("pickup_store_id")
    if not pickup_store_id:
        stores = await run_in_threadpool(
            _blocking_request, "GET", f"{REDX_BASE}/pickup/stores",
            headers={"API-ACCESS-TOKEN": f"Bearer {creds['access_token']}", "Accept": "application/json"},
        )
        rows = stores.get("data") if isinstance(stores, dict) else stores
        if isinstance(rows, list) and rows:
            pickup_store_id = rows[0].get("id") or rows[0].get("store_id")
    if not pickup_store_id:
        raise HTTPException(422, "RedX pickup store could not be resolved")
    payload = {
        "customer_name": recipient["name"], "customer_phone": recipient["phone"],
        "delivery_area": area_name, "delivery_area_id": area_id, "customer_address": recipient["address"],
        "merchant_invoice_id": order["id"], "cash_collection_amount": amount,
        "parcel_weight": 500, "instruction": instruction or item_desc,
        "value": _order_amount_bdt(order), "pickup_store_id": pickup_store_id,
    }
    result = await run_in_threadpool(
        _blocking_request, "POST", f"{REDX_BASE}/parcel",
        headers={"API-ACCESS-TOKEN": f"Bearer {creds['access_token']}", "Content-Type": "application/json", "Accept": "application/json"},
        json_body=payload,
    )
    data = result.get("data") if isinstance(result, dict) and isinstance(result.get("data"), dict) else result
    reference = str((data or {}).get("tracking_id") or (data or {}).get("tracking_code") or (data or {}).get("id") or "")
    if not reference:
        raise HTTPException(502, "RedX created no usable tracking reference")
    return reference, result


async def _track_provider(provider: str, reference: str, creds: dict):
    if provider == "pathao":
        token = await _pathao_token(creds)
        return await run_in_threadpool(
            _blocking_request, "GET", f"{PATHAO_BASE}/aladdin/api/v1/orders/{reference}/info",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
    if provider == "steadfast":
        return await run_in_threadpool(
            _blocking_request, "GET", f"{STEADFAST_BASE}/status_by_trackingcode/{reference}",
            headers={"Api-Key": creds["api_key"], "Secret-Key": creds["secret_key"], "Accept": "application/json"},
        )
    return await run_in_threadpool(
        _blocking_request, "GET", f"{REDX_BASE}/parcel/track/{reference}",
        headers={"API-ACCESS-TOKEN": f"Bearer {creds['access_token']}", "Accept": "application/json"},
    )


def _safe_provider_snapshot(payload):
    if not isinstance(payload, dict):
        return {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    safe = {}
    for key in ("status", "order_status", "delivery_status", "parcel_status", "consignment_id", "tracking_code", "tracking_id", "updated_at"):
        if key in data and isinstance(data[key], (str, int, float, bool, type(None))):
            safe[key] = data[key]
    return safe


async def _eligible_order(order: dict):
    if order.get("risk_hold") or order.get("operational_hold"):
        raise HTTPException(409, "Resolve Fraud Shield / operational hold before courier booking")
    if str(order.get("status") or "") not in {"packed", "ready_for_pickup", "confirmed", "processing"}:
        raise HTTPException(409, "Pack or confirm this order before courier booking")
    if str(order.get("status") or "").lower() in TERMINAL_ORDER_STATUSES:
        raise HTTPException(409, "This order is already closed")


class CourierBookBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: Optional[Literal["pathao", "steadfast", "redx"]] = None
    auto_fallback: bool = True


@router.post("/seller/integrations/couriers/book/{order_id}")
async def book_courier(order_id: str, body: CourierBookBody, user: dict = Depends(seller_dep)):
    order = await db.orders.find_one({"id": order_id, "seller_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    await _eligible_order(order)
    existing = await db.shipments.find_one({"order_id": order_id}, {"_id": 0})
    if existing and existing.get("tracking_code"):
        return {"ok": True, "replayed": True, "shipment": existing}

    routing = await growth_os.courier_recommendations(user["id"], order)
    ranked = [r["provider"] for r in routing.get("recommendations") or []]
    if body.provider:
        ranked = [body.provider] + [p for p in ranked if p != body.provider]
    if not body.auto_fallback:
        ranked = ranked[:1]
    if not ranked:
        raise HTTPException(409, "Enable at least one courier in Courier Autopilot")

    errors = []
    for provider in ranked:
        connection, creds = await _connection(user["id"], provider, required=False)
        if not connection:
            errors.append(f"{provider}: not connected")
            continue
        try:
            reference, provider_result = await _book_provider(provider, order, user["id"], creds)
        except HTTPException as exc:
            errors.append(f"{provider}: {exc.detail}")
            continue
        now = now_iso()
        shipment = {
            "id": (existing or {}).get("id") or new_id("ship_"), "order_id": order_id, "seller_id": user["id"],
            "provider": provider, "external_reference": reference, "tracking_code": reference,
            "status": "pickup_requested", "provider_snapshot": _safe_provider_snapshot(provider_result),
            "timeline": ((existing or {}).get("timeline") or []) + [{"status": "pickup_requested", "label": f"Booked with {provider.title()}", "at": now}],
            "created_at": (existing or {}).get("created_at") or now, "updated_at": now, "last_tracking_at": now,
        }
        await db.shipments.update_one({"order_id": order_id}, {"$set": shipment}, upsert=True)
        await db.orders.update_one(
            {"id": order_id, "seller_id": user["id"]},
            {"$set": {"selected_courier": provider, "shipment_id": shipment["id"], "courier_status": "pickup_requested", "status": "ready_for_pickup", "updated_at": now}},
        )
        return {"ok": True, "replayed": False, "provider": provider, "tracking_code": reference, "shipment": shipment, "fallback_errors": errors}
    raise HTTPException(503, "Courier booking failed. " + "; ".join(errors[:3]))


@router.post("/seller/integrations/couriers/track/{order_id}")
async def refresh_tracking(order_id: str, user: dict = Depends(seller_dep)):
    shipment = await db.shipments.find_one({"order_id": order_id, "seller_id": user["id"]}, {"_id": 0})
    if not shipment or not shipment.get("tracking_code"):
        raise HTTPException(404, "Booked shipment not found")
    _, creds = await _connection(user["id"], shipment["provider"])
    payload = await _track_provider(shipment["provider"], shipment["tracking_code"], creds)
    status = _safe_provider_status(shipment["provider"], payload)
    now = now_iso()
    event = {"status": status, "label": status.replace("_", " ").title(), "at": now}
    updates = {"status": status, "provider_snapshot": _safe_provider_snapshot(payload), "last_tracking_at": now, "updated_at": now}
    await db.shipments.update_one({"id": shipment["id"]}, {"$set": updates, "$push": {"timeline": event}})
    order_updates = {"courier_status": status, "updated_at": now}
    if status == "delivered":
        order_updates["status"] = "delivered"
    elif status == "returned":
        order_updates["status"] = "returned"
    elif status == "cancelled":
        order_updates["status"] = "cancelled"
    await db.orders.update_one({"id": order_id, "seller_id": user["id"]}, {"$set": order_updates})
    if status == "delivered":
        await reconcile_order_settlement(order_id)
    return {"ok": True, "status": status, "tracking_code": shipment["tracking_code"], "provider_snapshot": updates["provider_snapshot"]}


class VerificationLinkBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expires_hours: int = Field(default=24, ge=1, le=72)


@router.post("/seller/growth/orders/{order_id}/verification-link")
async def create_verification_link(order_id: str, body: VerificationLinkBody, user: dict = Depends(seller_dep)):
    order = await db.orders.find_one({"id": order_id, "seller_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    expires = _utcnow() + timedelta(hours=body.expires_hours)
    await db.order_verification_challenges.delete_many({"order_id": order_id, "status": "pending"})
    await db.order_verification_challenges.insert_one({
        "id": new_id("ov_"), "order_id": order_id, "seller_id": user["id"], "token_hash": token_hash,
        "status": "pending", "created_at": now_iso(), "expires_at": expires,
    })
    frontend = os.getenv("FRONTEND_URL", "").rstrip("/")
    if not frontend.startswith("https://") and os.getenv("APP_ENV", "development").lower() == "production":
        raise HTTPException(503, "Frontend URL is not configured for verification links")
    return {"ok": True, "url": f"{frontend}/verify-order/{token}", "expires_at": expires.isoformat()}


async def _challenge(token: str):
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    row = await db.order_verification_challenges.find_one({"token_hash": token_hash}, {"_id": 0})
    if not row or row.get("status") != "pending":
        raise HTTPException(404, "Verification link is invalid or already used")
    expires = row.get("expires_at")
    if isinstance(expires, datetime):
        expiry = expires if expires.tzinfo else expires.replace(tzinfo=timezone.utc)
    else:
        try:
            expiry = datetime.fromisoformat(str(expires).replace("Z", "+00:00"))
        except Exception:
            expiry = _utcnow() - timedelta(seconds=1)
    if expiry <= _utcnow():
        raise HTTPException(410, "Verification link expired")
    return row


@router.get("/order-verification/{token}")
async def public_verification_details(token: str):
    row = await _challenge(token)
    order = await db.orders.find_one({"id": row["order_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    phone = _digits((order.get("delivery_address") or {}).get("phone"))
    return {
        "order_id": order["id"], "shop_name": order.get("shop_name"), "customer_name": order.get("customer_name"),
        "phone_hint": ("***" + phone[-4:]) if phone else None, "total_paisa": int(order.get("total_paisa") or round(float(order.get("total") or 0) * 100)),
        "currency": order.get("currency", "BDT"), "items": [{"title": i.get("title"), "qty": i.get("qty")} for i in (order.get("items") or [])[:20]],
        "expires_at": row.get("expires_at"),
    }


class PublicVerificationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone_last4: str = Field(min_length=4, max_length=4, pattern=r"^[0-9]{4}$")


@router.post("/order-verification/{token}")
async def public_verify_order(token: str, body: PublicVerificationBody):
    row = await _challenge(token)
    order = await db.orders.find_one({"id": row["order_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    phone = _digits((order.get("delivery_address") or {}).get("phone"))
    if not phone or phone[-4:] != body.phone_last4:
        raise HTTPException(422, "Phone verification did not match this order")
    now = now_iso()
    verification = {"status": "customer_confirmed", "verified_at": now, "method": "secure_link"}
    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": {"fraud_verification": verification, "operational_hold": False, "operational_hold_reason": None, "updated_at": now}},
    )
    await db.order_verification_challenges.update_one({"id": row["id"]}, {"$set": {"status": "used", "used_at": now}})
    return {"ok": True, "status": "customer_confirmed"}


async def reconcile_order_settlement(order_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or str(order.get("status") or "").lower() not in {"delivered", "completed"}:
        return None
    accounting = order.get("accounting") or {}
    seller_net = int(accounting.get("seller_net_paisa") or 0)
    commission = int(accounting.get("platform_commission_paisa") or 0)
    if seller_net <= 0:
        return None
    payment_method = order.get("payment_method")
    kind = "platform_payable" if order.get("payment_status") == "paid" and payment_method == "nexora_wallet" else "cod_external"
    status = "ready" if kind == "platform_payable" else "external_collection_pending"
    record = {
        "order_id": order_id, "seller_id": order["seller_id"], "currency": "BDT", "kind": kind,
        "seller_net_paisa": seller_net, "platform_commission_paisa": commission, "status": status,
        "payment_method": payment_method, "updated_at": now_iso(),
    }
    await db.settlements.update_one(
        {"order_id": order_id},
        {"$set": record, "$setOnInsert": {"id": new_id("set_"), "created_at": now_iso()}}, upsert=True,
    )
    return await db.settlements.find_one({"order_id": order_id}, {"_id": 0})


@router.get("/seller/settlements")
async def seller_settlements(user: dict = Depends(seller_dep)):
    delivered = await db.orders.find({"seller_id": user["id"], "status": {"$in": ["delivered", "completed"]}}, {"_id": 0, "id": 1}).to_list(5000)
    for row in delivered:
        await reconcile_order_settlement(row["id"])
    rows = await db.settlements.find({"seller_id": user["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(1000)
    return {
        "items": rows,
        "summary": {
            "ready_paisa": sum(int(x.get("seller_net_paisa") or 0) for x in rows if x.get("status") == "ready"),
            "paid_paisa": sum(int(x.get("seller_net_paisa") or 0) for x in rows if x.get("status") == "paid"),
            "cod_external_pending_paisa": sum(int(x.get("seller_net_paisa") or 0) for x in rows if x.get("status") == "external_collection_pending"),
        },
    }


class SettlementActionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["mark_paid", "credit_seller_wallet", "mark_cod_collected"]
    reference: str = Field(default="", max_length=200)


@router.post("/admin/settlements/{settlement_id}/action")
async def admin_settlement_action(settlement_id: str, body: SettlementActionBody, user: dict = Depends(admin_dep)):
    settlement = await db.settlements.find_one({"id": settlement_id}, {"_id": 0})
    if not settlement:
        raise HTTPException(404, "Settlement not found")
    if settlement.get("status") == "paid":
        return settlement
    now = now_iso()
    if body.action == "mark_cod_collected":
        if settlement.get("kind") != "cod_external":
            raise HTTPException(409, "This is not an external COD settlement")
        await db.settlements.update_one({"id": settlement_id}, {"$set": {"status": "paid", "paid_at": now, "payout_reference": body.reference.strip(), "paid_by": user["id"], "updated_at": now}})
    elif body.action == "mark_paid":
        await db.settlements.update_one({"id": settlement_id}, {"$set": {"status": "paid", "paid_at": now, "payout_reference": body.reference.strip(), "paid_by": user["id"], "updated_at": now}})
    else:
        if settlement.get("kind") != "platform_payable" or settlement.get("status") != "ready":
            raise HTTPException(409, "Only ready platform payables can be credited to seller wallet")
        async def commit(session):
            fresh = await db.settlements.find_one({"id": settlement_id}, session=session)
            if not fresh or fresh.get("status") == "paid":
                return
            await wallet.ensure_wallet(fresh["seller_id"])
            changed = await db.wallets.update_one(wallet.identity(fresh["seller_id"]), {"$inc": {"balance_paisa": fresh["seller_net_paisa"]}}, session=session)
            if changed.matched_count != 1:
                raise HTTPException(409, "Seller wallet is unavailable")
            await db.wallet_ledger.insert_one({
                "id": new_id("wtx_"), "user_id": fresh["seller_id"], "mode": wallet.mode(), "reference": settlement_id,
                "amount_paisa": fresh["seller_net_paisa"], "type": "seller_settlement", "description": f"Settlement for order {fresh['order_id']}", "created_at": now,
            }, session=session)
            await db.settlements.update_one({"id": settlement_id}, {"$set": {"status": "paid", "paid_at": now, "payout_reference": f"wallet:{settlement_id}", "paid_by": user["id"], "updated_at": now}}, session=session)
        async with await client.start_session() as session:
            await session.with_transaction(commit)
    return await db.settlements.find_one({"id": settlement_id}, {"_id": 0})


async def _poll_shipments_once():
    rows = await db.shipments.find(
        {"tracking_code": {"$exists": True, "$ne": None}, "status": {"$nin": ["delivered", "returned", "cancelled"]}},
        {"_id": 0},
    ).sort([("last_tracking_at", 1)]).to_list(200)
    for shipment in rows:
        try:
            _, creds = await _connection(shipment["seller_id"], shipment["provider"], required=False)
            if not creds:
                continue
            payload = await _track_provider(shipment["provider"], shipment["tracking_code"], creds)
            status = _safe_provider_status(shipment["provider"], payload)
            now = now_iso()
            await db.shipments.update_one({"id": shipment["id"]}, {"$set": {"status": status, "provider_snapshot": _safe_provider_snapshot(payload), "last_tracking_at": now, "updated_at": now}})
            order_update = {"courier_status": status, "updated_at": now}
            if status in {"delivered", "returned", "cancelled"}:
                order_update["status"] = status
            await db.orders.update_one({"id": shipment["order_id"]}, {"$set": order_update})
            if status == "delivered":
                await reconcile_order_settlement(shipment["order_id"])
        except Exception:
            continue


async def worker_loop():
    while True:
        try:
            await _poll_shipments_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            pass
        await asyncio.sleep(600)
