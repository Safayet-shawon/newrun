"""Nexora wallet: integer-paisa ledger, isolated test balances, verified deposits."""
import hashlib
import hmac
import json
import os
import time
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, ConfigDict
from pymongo.errors import DuplicateKeyError

from db import db, client, new_id, now_iso
from security import get_current_user
from global_core import SUPPORTED_CURRENCIES, convert_amount

router = APIRouter()


def mode():
    configured_mode = os.getenv("PAYMENTS_MODE", os.getenv("SSLCOMMERZ_MODE", "sandbox"))
    return "live" if configured_mode == "live" else "sandbox"


def gateway_origin():
    return "https://securepay.sslcommerz.com" if os.getenv("SSLCOMMERZ_MODE") == "live" else "https://sandbox.sslcommerz.com"


def sslcommerz_configured():
    return bool(
        os.getenv("SSLCOMMERZ_STORE_ID")
        and os.getenv("SSLCOMMERZ_STORE_PASSWORD")
        and os.getenv("PAYMENT_CALLBACK_BASE_URL", "").startswith("https://")
        and os.getenv("FRONTEND_URL")
    )


def stripe_configured():
    return bool(os.getenv("STRIPE_SECRET_KEY") and os.getenv("STRIPE_WEBHOOK_SECRET") and os.getenv("FRONTEND_URL"))


def configured():
    return sslcommerz_configured() or stripe_configured()


def identity(user_id):
    return {"user_id": user_id, "mode": mode()}


async def ensure_wallet(user_id):
    await db.wallets.update_one(identity(user_id), {"$setOnInsert": {"balance_paisa": 0, "created_at": now_iso()}}, upsert=True)


@router.get("/account/wallet")
async def get_wallet(user=Depends(get_current_user)):
    await ensure_wallet(user["id"])
    wallet = await db.wallets.find_one(identity(user["id"]), {"_id": 0})
    ledger = await db.wallet_ledger.find(identity(user["id"]), {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    deposits = await db.wallet_deposits.find(identity(user["id"]), {"_id": 0, "gateway_url": 0, "session_key": 0, "key": 0}).sort("created_at", -1).limit(30).to_list(30)
    providers = {
        "sslcommerz": sslcommerz_configured(),
        "stripe": stripe_configured(),
    }
    return {**wallet, "currency": "BDT", "transactions": ledger, "deposits": deposits, "topup_enabled": any(providers.values()), "topup_providers": providers}


@router.get("/payment-methods")
async def payment_methods():
    providers = {"sslcommerz": sslcommerz_configured(), "stripe": stripe_configured()}
    return {
        "methods": [
            {"id": "cash_on_delivery", "name": "Cash on delivery", "enabled": True},
            {"id": "nexora_wallet", "name": "Nexora Wallet", "enabled": True},
        ],
        "topup_enabled": any(providers.values()),
        "topup_providers": providers,
        "mode": mode(),
    }


class DepositBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount_paisa: int = Field(ge=1000, le=50000000, strict=True)
    idempotency_key: str = Field(min_length=16, max_length=100)
    phone: str = Field(pattern=r"^\+?[0-9]{10,15}$")


class StripeDepositBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount_paisa: int = Field(ge=1000, le=50000000, strict=True)
    idempotency_key: str = Field(min_length=16, max_length=100)
    currency: str = Field(default="USD", min_length=3, max_length=3)


def gateway_request(method, path, **kwargs):
    try:
        response = requests.request(method, gateway_origin() + path, timeout=20, **kwargs)
        response.raise_for_status()
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError()
        return result
    except (requests.RequestException, ValueError):
        raise HTTPException(503, "Payment provider could not be reached. Check your deposit history before retrying.")


def stripe_request(path, *, data, idempotency_key=None):
    headers = {"Authorization": f"Bearer {os.environ['STRIPE_SECRET_KEY']}"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    try:
        response = requests.post("https://api.stripe.com" + path, data=data, headers=headers, timeout=25)
        response.raise_for_status()
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError()
        return result
    except (requests.RequestException, ValueError):
        raise HTTPException(503, "International card provider could not be reached. Check your deposit history before retrying.")


async def _insert_deposit(user_id: str, key_value: str, amount_paisa: int, provider: str, **extra):
    await ensure_wallet(user_id)
    key = {**identity(user_id), "key": key_value}
    deposit = {**key, "id": new_id("dep_"), "amount_paisa": amount_paisa, "provider": provider, "status": "pending", "created_at": now_iso(), **extra}
    try:
        await db.wallet_deposits.insert_one(dict(deposit))
        return deposit, False
    except DuplicateKeyError:
        previous = await db.wallet_deposits.find_one(key)
        if not previous or previous.get("amount_paisa") != amount_paisa or previous.get("provider") != provider:
            raise HTTPException(409, "This request was already used for another deposit.")
        if previous.get("gateway_url") and previous.get("status") == "pending":
            return previous, True
        raise HTTPException(409, "This deposit has already been submitted. Refresh your wallet.")


@router.post("/account/wallet/deposits")
async def start_deposit(body: DepositBody, user=Depends(get_current_user)):
    if not sslcommerz_configured():
        raise HTTPException(503, "Local payment provider is not connected.")
    deposit, reused = await _insert_deposit(user["id"], body.idempotency_key, body.amount_paisa, "sslcommerz")
    if reused:
        return {"id": deposit["id"], "gateway_url": deposit["gateway_url"], "provider": "sslcommerz"}
    callback = os.environ["PAYMENT_CALLBACK_BASE_URL"].rstrip("/") + "/api/payments/sslcommerz"
    data = {
        "store_id": os.environ["SSLCOMMERZ_STORE_ID"],
        "store_passwd": os.environ["SSLCOMMERZ_STORE_PASSWORD"],
        "total_amount": f"{body.amount_paisa / 100:.2f}",
        "currency": "BDT",
        "tran_id": deposit["id"],
        "success_url": callback + "/return",
        "fail_url": callback + "/return",
        "cancel_url": callback + "/return",
        "ipn_url": callback + "/ipn",
        "cus_name": user["name"],
        "cus_email": user["email"],
        "cus_phone": body.phone,
        "cus_country": "Bangladesh",
        "shipping_method": "NO",
        "num_of_item": 1,
        "product_name": "Nexora Wallet deposit",
        "product_category": "top up",
        "product_profile": "non-physical-goods",
        "emi_option": 0,
    }
    result = await run_in_threadpool(gateway_request, "POST", "/gwprocess/v4/api.php", data=data)
    url = result.get("GatewayPageURL", "")
    if result.get("status") != "SUCCESS" or urlparse(url).scheme != "https" or urlparse(url).hostname != urlparse(gateway_origin()).hostname:
        raise HTTPException(502, "Payment provider did not create a checkout. No money was added.")
    await db.wallet_deposits.update_one({"id": deposit["id"]}, {"$set": {"gateway_url": url, "session_key": result.get("sessionkey")}})
    return {"id": deposit["id"], "gateway_url": url, "provider": "sslcommerz"}


@router.post("/account/wallet/deposits/stripe")
async def start_stripe_deposit(body: StripeDepositBody, user=Depends(get_current_user)):
    if not stripe_configured():
        raise HTTPException(503, "International card provider is not connected.")
    currency = body.currency.upper()
    if currency not in SUPPORTED_CURRENCIES or currency == "BDT":
        raise HTTPException(422, "Choose a configured international currency")
    try:
        converted = convert_amount(Decimal(body.amount_paisa) / 100, "BDT", currency)
    except ValueError as exc:
        raise HTTPException(503, str(exc)) from exc
    minor_unit = SUPPORTED_CURRENCIES[currency]["minor_unit"]
    charged_minor = int((converted * (Decimal(10) ** minor_unit)).to_integral_value())
    if charged_minor < 50:
        raise HTTPException(422, "Amount is too small for international card checkout")

    deposit, reused = await _insert_deposit(
        user["id"],
        body.idempotency_key,
        body.amount_paisa,
        "stripe",
        charged_currency=currency,
        charged_amount_minor=charged_minor,
        fx_display_amount=str(converted),
    )
    if reused:
        return {"id": deposit["id"], "gateway_url": deposit["gateway_url"], "provider": "stripe"}

    frontend = os.environ["FRONTEND_URL"].rstrip("/")
    payload = {
        "mode": "payment",
        "success_url": frontend + "/account/wallet?payment=returned&provider=stripe",
        "cancel_url": frontend + "/account/wallet?payment=cancelled&provider=stripe",
        "client_reference_id": deposit["id"],
        "customer_email": user["email"],
        "metadata[deposit_id]": deposit["id"],
        "line_items[0][price_data][currency]": currency.lower(),
        "line_items[0][price_data][unit_amount]": str(charged_minor),
        "line_items[0][price_data][product_data][name]": "Nexora Wallet deposit",
        "line_items[0][quantity]": "1",
    }
    session = await run_in_threadpool(stripe_request, "/v1/checkout/sessions", data=payload, idempotency_key=deposit["id"])
    url = str(session.get("url") or "")
    if not url.startswith("https://checkout.stripe.com/"):
        raise HTTPException(502, "International card provider did not create a checkout")
    await db.wallet_deposits.update_one({"id": deposit["id"]}, {"$set": {"gateway_url": url, "stripe_session_id": session.get("id")}})
    return {"id": deposit["id"], "gateway_url": url, "provider": "stripe", "charged_currency": currency, "charged_amount": float(converted)}


async def _credit_wallet_deposit(deposit: dict, validation_id: str, description: str, session):
    if deposit.get("status") == "credited":
        return {"status": "credited"}
    changed = await db.wallets.update_one(
        {"user_id": deposit["user_id"], "mode": deposit["mode"]},
        {"$inc": {"balance_paisa": deposit["amount_paisa"]}},
        session=session,
    )
    if changed.matched_count != 1:
        raise HTTPException(409, "Wallet unavailable. Payment has not been credited yet.")
    await db.wallet_ledger.insert_one({
        "id": new_id("wtx_"),
        "user_id": deposit["user_id"],
        "mode": deposit["mode"],
        "reference": deposit["id"],
        "validation_id": validation_id,
        "provider": deposit.get("provider"),
        "amount_paisa": deposit["amount_paisa"],
        "type": "deposit",
        "description": description,
        "created_at": now_iso(),
    }, session=session)
    await db.wallet_deposits.update_one({"id": deposit["id"]}, {"$set": {"status": "credited", "credited_at": now_iso(), "validation_id": validation_id}}, session=session)
    return {"status": "credited"}


async def credit_verified_deposit(deposit_id, verified):
    """Only called with a response fetched directly from SSLCommerz validation API."""
    async def commit(session):
        deposit = await db.wallet_deposits.find_one({"id": deposit_id, "mode": mode(), "provider": {"$in": ["sslcommerz", None]}}, session=session)
        if not deposit:
            raise HTTPException(404, "Deposit not found")
        try:
            matches = Decimal(str(verified.get("amount"))) * 100 == deposit["amount_paisa"]
        except (InvalidOperation, ValueError):
            matches = False
        if not (
            verified.get("status") in ("VALID", "VALIDATED")
            and verified.get("tran_id") == deposit_id
            and verified.get("currency") == "BDT"
            and verified.get("currency_type", "BDT") == "BDT"
            and matches
            and str(verified.get("risk_level")) == "0"
            and verified.get("val_id")
        ):
            raise HTTPException(400, "Deposit payment could not be verified")
        return await _credit_wallet_deposit(deposit, verified["val_id"], "Wallet deposit", session)

    async with await client.start_session() as session:
        return await session.with_transaction(commit)


@router.post("/payments/sslcommerz/ipn")
async def payment_notification(request: Request):
    if not sslcommerz_configured():
        raise HTTPException(503, "Payment provider is not connected")
    form = await request.form()
    deposit_id, validation_id = str(form.get("tran_id", "")), str(form.get("val_id", ""))
    if not validation_id or len(validation_id) > 100 or not await db.wallet_deposits.find_one({"id": deposit_id, "mode": mode()}):
        raise HTTPException(400, "Unknown payment notification")
    verified = await run_in_threadpool(
        gateway_request,
        "GET",
        "/validator/api/validationserverAPI.php",
        params={
            "val_id": validation_id,
            "store_id": os.environ["SSLCOMMERZ_STORE_ID"],
            "store_passwd": os.environ["SSLCOMMERZ_STORE_PASSWORD"],
            "format": "json",
        },
    )
    return await credit_verified_deposit(deposit_id, verified)


@router.post("/payments/sslcommerz/return")
async def payment_return(request: Request):
    if not sslcommerz_configured():
        raise HTTPException(503, "Payment provider is not connected")
    form = await request.form()
    if form.get("val_id"):
        try:
            await payment_notification(request)
        except HTTPException:
            pass
    return RedirectResponse(os.environ["FRONTEND_URL"].rstrip("/") + "/account/wallet?payment=returned", status_code=303)


def _verify_stripe_signature(payload: bytes, signature_header: str):
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    parts = {}
    for piece in signature_header.split(","):
        if "=" not in piece:
            continue
        key, value = piece.split("=", 1)
        parts.setdefault(key.strip(), []).append(value.strip())
    try:
        timestamp = int((parts.get("t") or [""])[0])
    except ValueError:
        raise HTTPException(400, "Invalid Stripe signature")
    if abs(int(time.time()) - timestamp) > 300:
        raise HTTPException(400, "Expired Stripe signature")
    signed = f"{timestamp}.".encode() + payload
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, candidate) for candidate in parts.get("v1", [])):
        raise HTTPException(400, "Invalid Stripe signature")


@router.post("/payments/stripe/webhook")
async def stripe_webhook(request: Request):
    if not stripe_configured():
        raise HTTPException(503, "International card provider is not connected")
    payload = await request.body()
    _verify_stripe_signature(payload, request.headers.get("stripe-signature", ""))
    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid webhook payload")
    if event.get("type") != "checkout.session.completed":
        return {"received": True}
    session_object = ((event.get("data") or {}).get("object") or {})
    deposit_id = session_object.get("client_reference_id") or (session_object.get("metadata") or {}).get("deposit_id")
    deposit = await db.wallet_deposits.find_one({"id": deposit_id, "mode": mode(), "provider": "stripe"})
    if not deposit:
        raise HTTPException(400, "Unknown Stripe deposit")
    if session_object.get("payment_status") != "paid":
        return {"received": True}
    if str(session_object.get("currency", "")).upper() != str(deposit.get("charged_currency", "")).upper():
        raise HTTPException(400, "Stripe currency mismatch")
    if int(session_object.get("amount_total") or -1) != int(deposit.get("charged_amount_minor") or -2):
        raise HTTPException(400, "Stripe amount mismatch")
    if deposit.get("stripe_session_id") and session_object.get("id") != deposit.get("stripe_session_id"):
        raise HTTPException(400, "Stripe session mismatch")

    async def commit(session):
        fresh = await db.wallet_deposits.find_one({"id": deposit_id, "mode": mode(), "provider": "stripe"}, session=session)
        if not fresh:
            raise HTTPException(404, "Deposit not found")
        return await _credit_wallet_deposit(fresh, session_object.get("id"), "International card wallet deposit", session)

    async with await client.start_session() as mongo_session:
        await mongo_session.with_transaction(commit)
    return {"received": True}


async def debit_wallet(user_id, amount, checkout_id, session):
    if mode() == "sandbox" and not (os.getenv("DB_NAME") == "nexora_local" and "127.0.0.1:27018" in os.getenv("MONGO_URL", "")):
        raise HTTPException(409, "Test wallet purchases are restricted to the local development catalogue.")
    result = await db.wallets.update_one(
        {**identity(user_id), "balance_paisa": {"$gte": amount}},
        {"$inc": {"balance_paisa": -amount}},
        session=session,
    )
    if result.modified_count != 1:
        raise HTTPException(409, "Your Nexora Wallet balance is too low. Add money or choose cash on delivery.")
    await db.wallet_ledger.insert_one({
        **identity(user_id),
        "id": new_id("wtx_"),
        "reference": checkout_id,
        "amount_paisa": -amount,
        "type": "purchase",
        "description": "Marketplace purchase",
        "created_at": now_iso(),
    }, session=session)
