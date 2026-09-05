"""Nexora wallet: integer-paisa ledger, isolated test balances, verified deposits."""
import os
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

router = APIRouter()

def mode():
    return "live" if os.getenv("SSLCOMMERZ_MODE") == "live" else "sandbox"

def gateway_origin():
    return "https://securepay.sslcommerz.com" if mode() == "live" else "https://sandbox.sslcommerz.com"

def configured():
    return bool(os.getenv("SSLCOMMERZ_STORE_ID") and os.getenv("SSLCOMMERZ_STORE_PASSWORD") and os.getenv("PAYMENT_CALLBACK_BASE_URL", "").startswith("https://") and os.getenv("FRONTEND_URL"))

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
    return {**wallet, "currency": "BDT", "transactions": ledger, "deposits": deposits, "topup_enabled": configured()}

@router.get("/payment-methods")
async def payment_methods():
    return {"methods": [{"id": "cash_on_delivery", "name": "Cash on delivery", "enabled": True}, {"id": "nexora_wallet", "name": "Nexora Wallet", "enabled": True}], "topup_enabled": configured(), "mode": mode()}

class DepositBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount_paisa: int = Field(ge=1000, le=50000000, strict=True)
    idempotency_key: str = Field(min_length=16, max_length=100)
    phone: str = Field(pattern=r"^\+?[0-9]{10,15}$")

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

@router.post("/account/wallet/deposits")
async def start_deposit(body: DepositBody, user=Depends(get_current_user)):
    if not configured():
        raise HTTPException(503, "Adding money is unavailable until the payment provider is connected.")
    await ensure_wallet(user["id"])
    key = {**identity(user["id"]), "key": body.idempotency_key}
    deposit = {**key, "id": new_id("dep_"), "amount_paisa": body.amount_paisa, "status": "pending", "created_at": now_iso()}
    try:
        await db.wallet_deposits.insert_one(dict(deposit))
    except DuplicateKeyError:
        previous = await db.wallet_deposits.find_one(key)
        if not previous or previous["amount_paisa"] != body.amount_paisa:
            raise HTTPException(409, "This request was already used for another deposit.")
        if previous.get("gateway_url") and previous["status"] == "pending":
            return {"id": previous["id"], "gateway_url": previous["gateway_url"]}
        raise HTTPException(409, "This deposit has already been submitted. Refresh your wallet.")
    callback = os.environ["PAYMENT_CALLBACK_BASE_URL"].rstrip("/") + "/api/payments/sslcommerz"
    data = {"store_id": os.environ["SSLCOMMERZ_STORE_ID"], "store_passwd": os.environ["SSLCOMMERZ_STORE_PASSWORD"], "total_amount": f"{body.amount_paisa / 100:.2f}", "currency": "BDT", "tran_id": deposit["id"], "success_url": callback + "/return", "fail_url": callback + "/return", "cancel_url": callback + "/return", "ipn_url": callback + "/ipn", "cus_name": user["name"], "cus_email": user["email"], "cus_phone": body.phone, "cus_country": "Bangladesh", "shipping_method": "NO", "num_of_item": 1, "product_name": "Nexora Wallet deposit", "product_category": "top up", "product_profile": "non-physical-goods", "emi_option": 0}
    result = await run_in_threadpool(gateway_request, "POST", "/gwprocess/v4/api.php", data=data)
    url = result.get("GatewayPageURL", "")
    if result.get("status") != "SUCCESS" or urlparse(url).scheme != "https" or urlparse(url).hostname != urlparse(gateway_origin()).hostname:
        raise HTTPException(502, "Payment provider did not create a checkout. No money was added.")
    await db.wallet_deposits.update_one({"id": deposit["id"]}, {"$set": {"gateway_url": url, "session_key": result.get("sessionkey")}})
    return {"id": deposit["id"], "gateway_url": url}

async def credit_verified_deposit(deposit_id, verified):
    """Only called with a response fetched directly from the provider's validation API."""
    async def commit(session):
        deposit = await db.wallet_deposits.find_one({"id": deposit_id, "mode": mode()}, session=session)
        if not deposit:
            raise HTTPException(404, "Deposit not found")
        try:
            matches = Decimal(str(verified.get("amount"))) * 100 == deposit["amount_paisa"]
        except (InvalidOperation, ValueError):
            matches = False
        if not (verified.get("status") in ("VALID", "VALIDATED") and verified.get("tran_id") == deposit_id and verified.get("currency") == "BDT" and verified.get("currency_type", "BDT") == "BDT" and matches and str(verified.get("risk_level")) == "0" and verified.get("val_id")):
            raise HTTPException(400, "Deposit payment could not be verified")
        if deposit["status"] == "credited":
            return {"status": "credited"}
        changed = await db.wallets.update_one({"user_id": deposit["user_id"], "mode": deposit["mode"]}, {"$inc": {"balance_paisa": deposit["amount_paisa"]}}, session=session)
        if changed.matched_count != 1:
            raise HTTPException(409, "Wallet unavailable. Payment has not been credited yet.")
        await db.wallet_ledger.insert_one({"id": new_id("wtx_"), "user_id": deposit["user_id"], "mode": deposit["mode"], "reference": deposit_id, "validation_id": verified["val_id"], "amount_paisa": deposit["amount_paisa"], "type": "deposit", "description": "Wallet deposit", "created_at": now_iso()}, session=session)
        await db.wallet_deposits.update_one({"id": deposit_id}, {"$set": {"status": "credited", "credited_at": now_iso()}}, session=session)
        return {"status": "credited"}
    async with await client.start_session() as session:
        return await session.with_transaction(commit)

@router.post("/payments/sslcommerz/ipn")
async def payment_notification(request: Request):
    if not configured():
        raise HTTPException(503, "Payment provider is not connected")
    form = await request.form()
    deposit_id, validation_id = str(form.get("tran_id", "")), str(form.get("val_id", ""))
    if not validation_id or len(validation_id) > 100 or not await db.wallet_deposits.find_one({"id": deposit_id, "mode": mode()}):
        raise HTTPException(400, "Unknown payment notification")
    verified = await run_in_threadpool(gateway_request, "GET", "/validator/api/validationserverAPI.php", params={"val_id": validation_id, "store_id": os.environ["SSLCOMMERZ_STORE_ID"], "store_passwd": os.environ["SSLCOMMERZ_STORE_PASSWORD"], "format": "json"})
    return await credit_verified_deposit(deposit_id, verified)

@router.post("/payments/sslcommerz/return")
async def payment_return(request: Request):
    # The browser redirect itself is never proof of payment.
    if not configured():
        raise HTTPException(503, "Payment provider is not connected")
    form = await request.form()
    if form.get("val_id"):
        try:
            await payment_notification(request)
        except HTTPException:
            pass  # The IPN can retry; wallet UI shows the persisted status.
    return RedirectResponse(os.environ["FRONTEND_URL"].rstrip("/") + "/account/wallet?payment=returned", status_code=303)

async def debit_wallet(user_id, amount, checkout_id, session):
    if mode() == "sandbox" and not (os.getenv("DB_NAME") == "nexora_local" and "127.0.0.1:27018" in os.getenv("MONGO_URL", "")):
        raise HTTPException(409, "Test wallet purchases are restricted to the local development catalogue.")
    result = await db.wallets.update_one({**identity(user_id), "balance_paisa": {"$gte": amount}}, {"$inc": {"balance_paisa": -amount}}, session=session)
    if result.modified_count != 1:
        raise HTTPException(409, "Your Nexora Wallet balance is too low. Add money or choose cash on delivery.")
    await db.wallet_ledger.insert_one({**identity(user_id), "id": new_id("wtx_"), "reference": checkout_id, "amount_paisa": -amount, "type": "purchase", "description": "Marketplace purchase", "created_at": now_iso()}, session=session)
