import asyncio
import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import requests
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from db import db, new_id, now_iso
from security import require_role

router = APIRouter()
seller_dep = require_role("seller")
GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v23.0")


def _utcnow():
    return datetime.now(timezone.utc)


def _parse_iso(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _token_cipher():
    secret = os.getenv("INTEGRATION_ENCRYPTION_SECRET") or os.getenv("JWT_SECRET")
    if not secret:
        raise HTTPException(503, "Integration encryption is not configured")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def _encrypt(value: str) -> str:
    return _token_cipher().encrypt(value.encode("utf-8")).decode("utf-8")


def _decrypt(value: str) -> str:
    try:
        return _token_cipher().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise HTTPException(503, "Stored integration token cannot be decrypted") from exc


def _hash_capability(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _public_connection(connection):
    if not connection:
        return None
    clean = dict(connection)
    clean.pop("access_token_encrypted", None)
    return clean


async def ensure_indexes():
    await db.channel_connections.create_index(
        [("seller_id", 1), ("provider", 1), ("external_account_id", 1)], unique=True
    )
    await db.channel_connections.create_index(
        [("provider", 1), ("external_account_id", 1)], unique=True
    )
    await db.conversations.create_index(
        [("seller_id", 1), ("provider", 1), ("external_account_id", 1), ("external_customer_id", 1)], unique=True
    )
    await db.conversations.create_index([("seller_id", 1), ("last_message_at", -1)])
    await db.messages.create_index("external_message_id", unique=True, sparse=True)
    await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
    await db.instant_checkout_links.create_index("token_hash", unique=True)
    await db.instant_checkout_links.create_index([("seller_id", 1), ("created_at", -1)])


class ConnectionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: Literal["messenger", "whatsapp"]
    external_account_id: str = Field(min_length=2, max_length=160)
    access_token: str = Field(min_length=10, max_length=4096)
    display_name: str = Field(min_length=1, max_length=120)


class SendMessageBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=4000)


class CheckoutItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_id: str = Field(min_length=1, max_length=100)
    qty: int = Field(default=1, ge=1, le=99)
    variant: Optional[str] = Field(default=None, max_length=300)
    options: dict[str, str] = Field(default_factory=dict)
    customization: dict[str, str] = Field(default_factory=dict)


class CheckoutLinkBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    conversation_id: Optional[str] = Field(default=None, max_length=100)
    items: list[CheckoutItem] = Field(min_length=1, max_length=25)
    expires_hours: int = Field(default=48, ge=1, le=168)
    note: str = Field(default="", max_length=500)


@router.get("/seller/inbox/connections")
async def list_connections(user: dict = Depends(seller_dep)):
    rows = await db.channel_connections.find({"seller_id": user["id"]}, {"_id": 0}).sort([("provider", 1)]).to_list(20)
    return [_public_connection(row) for row in rows]


@router.post("/seller/inbox/connections")
async def connect_channel(body: ConnectionBody, user: dict = Depends(seller_dep)):
    connection = {
        "seller_id": user["id"],
        "provider": body.provider,
        "external_account_id": body.external_account_id.strip(),
        "display_name": body.display_name.strip(),
        "access_token_encrypted": _encrypt(body.access_token.strip()),
        "status": "connected",
        "updated_at": now_iso(),
    }
    await db.channel_connections.update_one(
        {"seller_id": user["id"], "provider": body.provider, "external_account_id": body.external_account_id.strip()},
        {"$set": connection, "$setOnInsert": {"id": new_id("chan_"), "created_at": now_iso()}},
        upsert=True,
    )
    row = await db.channel_connections.find_one(
        {"seller_id": user["id"], "provider": body.provider, "external_account_id": body.external_account_id.strip()},
        {"_id": 0},
    )
    return _public_connection(row)


@router.delete("/seller/inbox/connections/{connection_id}")
async def disconnect_channel(connection_id: str, user: dict = Depends(seller_dep)):
    result = await db.channel_connections.delete_one({"id": connection_id, "seller_id": user["id"]})
    if not result.deleted_count:
        raise HTTPException(404, "Connection not found")
    return {"ok": True}


@router.get("/seller/inbox/conversations")
async def list_conversations(
    user: dict = Depends(seller_dep),
    provider: Optional[Literal["messenger", "whatsapp"]] = None,
    q: Optional[str] = Query(default=None, max_length=120),
):
    query = {"seller_id": user["id"]}
    if provider:
        query["provider"] = provider
    if q:
        query["$or"] = [
            {"customer_name": {"$regex": q, "$options": "i"}},
            {"external_customer_id": {"$regex": q, "$options": "i"}},
            {"last_message": {"$regex": q, "$options": "i"}},
        ]
    return await db.conversations.find(query, {"_id": 0}).sort([("last_message_at", -1)]).to_list(500)


@router.get("/seller/inbox/conversations/{conversation_id}/messages")
async def conversation_messages(conversation_id: str, user: dict = Depends(seller_dep)):
    conversation = await db.conversations.find_one({"id": conversation_id, "seller_id": user["id"]}, {"_id": 0})
    if not conversation:
        raise HTTPException(404, "Conversation not found")
    rows = await db.messages.find({"conversation_id": conversation_id}, {"_id": 0}).sort([("created_at", 1)]).to_list(2000)
    await db.conversations.update_one({"id": conversation_id}, {"$set": {"unread_count": 0, "updated_at": now_iso()}})
    return {"conversation": {**conversation, "unread_count": 0}, "messages": rows}


async def _post_json(url: str, *, headers=None, params=None, payload=None):
    def run():
        return requests.post(url, headers=headers, params=params, json=payload, timeout=20)

    response = await asyncio.to_thread(run)
    try:
        data = response.json()
    except Exception:
        data = {"raw": response.text[:1000]}
    if response.status_code >= 400:
        detail = data.get("error", {}).get("message") if isinstance(data, dict) else None
        raise HTTPException(502, detail or f"Channel provider returned HTTP {response.status_code}")
    return data


async def _send_provider_message(connection: dict, external_customer_id: str, text: str):
    token = _decrypt(connection["access_token_encrypted"])
    provider = connection["provider"]
    account_id = connection["external_account_id"]
    if provider == "messenger":
        url = f"https://graph.facebook.com/{GRAPH_VERSION}/{account_id}/messages"
        data = await _post_json(
            url,
            params={"access_token": token},
            payload={"messaging_type": "RESPONSE", "recipient": {"id": external_customer_id}, "message": {"text": text}},
        )
        return data.get("message_id")
    if provider == "whatsapp":
        url = f"https://graph.facebook.com/{GRAPH_VERSION}/{account_id}/messages"
        data = await _post_json(
            url,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            payload={"messaging_product": "whatsapp", "to": external_customer_id, "type": "text", "text": {"body": text}},
        )
        messages = data.get("messages") or []
        return messages[0].get("id") if messages else None
    raise HTTPException(422, "Unsupported channel")


@router.post("/seller/inbox/conversations/{conversation_id}/messages")
async def send_message(conversation_id: str, body: SendMessageBody, user: dict = Depends(seller_dep)):
    conversation = await db.conversations.find_one({"id": conversation_id, "seller_id": user["id"]}, {"_id": 0})
    if not conversation:
        raise HTTPException(404, "Conversation not found")
    connection = await db.channel_connections.find_one(
        {
            "seller_id": user["id"],
            "provider": conversation["provider"],
            "external_account_id": conversation["external_account_id"],
            "status": "connected",
        },
        {"_id": 0},
    )
    if not connection:
        raise HTTPException(409, "Reconnect this channel before sending messages")
    external_id = await _send_provider_message(connection, conversation["external_customer_id"], body.text.strip())
    message = {
        "id": new_id("msg_"),
        "conversation_id": conversation_id,
        "seller_id": user["id"],
        "provider": conversation["provider"],
        "direction": "outbound",
        "external_message_id": external_id,
        "message_type": "text",
        "text": body.text.strip(),
        "status": "sent",
        "created_at": now_iso(),
    }
    await db.messages.insert_one(dict(message))
    await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {"last_message": body.text.strip(), "last_message_at": message["created_at"], "updated_at": now_iso()}},
    )
    return message


@router.post("/seller/inbox/checkout-links")
async def create_checkout_link(body: CheckoutLinkBody, user: dict = Depends(seller_dep)):
    shop = await db.shops.find_one({"seller_id": user["id"]}, {"_id": 0})
    if not shop:
        raise HTTPException(400, "Complete seller onboarding first")
    if body.conversation_id:
        conversation = await db.conversations.find_one({"id": body.conversation_id, "seller_id": user["id"]}, {"_id": 0})
        if not conversation:
            raise HTTPException(404, "Conversation not found")

    normalized_items = []
    for item in body.items:
        product = await db.products.find_one(
            {"id": item.product_id, "seller_id": user["id"], "shop_id": shop["id"], "status": "published"},
            {"_id": 0},
        )
        if not product:
            raise HTTPException(409, "A selected product is not published or does not belong to your shop")
        if int(product.get("stock") or 0) < item.qty:
            raise HTTPException(409, f"Insufficient stock for {product.get('title', 'a selected product')}")
        normalized_items.append(item.model_dump())

    raw_token = secrets.token_urlsafe(32)
    expires_at = (_utcnow() + timedelta(hours=body.expires_hours)).isoformat()
    record = {
        "id": new_id("icl_"),
        "token_hash": _hash_capability(raw_token),
        "seller_id": user["id"],
        "shop_id": shop["id"],
        "shop_name": shop["name"],
        "conversation_id": body.conversation_id,
        "items": normalized_items,
        "note": body.note.strip(),
        "status": "active",
        "open_count": 0,
        "expires_at": expires_at,
        "created_at": now_iso(),
    }
    await db.instant_checkout_links.insert_one(dict(record))
    frontend = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    link = f"{frontend}/c/{raw_token}"
    if body.conversation_id:
        await db.conversations.update_one(
            {"id": body.conversation_id, "seller_id": user["id"]},
            {"$set": {"last_checkout_link_id": record["id"], "updated_at": now_iso()}},
        )
    return {"id": record["id"], "url": link, "expires_at": expires_at, "items": normalized_items}


async def _resolve_checkout_link(raw_token: str):
    record = await db.instant_checkout_links.find_one({"token_hash": _hash_capability(raw_token), "status": "active"}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Checkout link not found")
    expiry = _parse_iso(record.get("expires_at"))
    if not expiry or expiry <= _utcnow():
        await db.instant_checkout_links.update_one({"id": record["id"]}, {"$set": {"status": "expired", "updated_at": now_iso()}})
        raise HTTPException(410, "This checkout link has expired")
    return record


@router.get("/instant-checkout/{token}")
async def instant_checkout(token: str):
    record = await _resolve_checkout_link(token)
    hydrated = []
    for item in record.get("items") or []:
        product = await db.products.find_one({"id": item["product_id"], "status": "published"}, {"_id": 0})
        if product:
            hydrated.append({"product": product, **item})
    if not hydrated:
        raise HTTPException(410, "The products in this checkout link are no longer available")
    await db.instant_checkout_links.update_one(
        {"id": record["id"]},
        {"$inc": {"open_count": 1}, "$set": {"last_opened_at": now_iso()}},
    )
    return {
        "id": record["id"],
        "shop_id": record["shop_id"],
        "shop_name": record.get("shop_name"),
        "note": record.get("note"),
        "expires_at": record["expires_at"],
        "items": hydrated,
    }


def _verify_meta_signature(raw_body: bytes, signature: str | None):
    app_secret = os.getenv("META_APP_SECRET")
    if not app_secret:
        return
    if not signature or not signature.startswith("sha256="):
        raise HTTPException(401, "Missing Meta webhook signature")
    expected = hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature.split("=", 1)[1], expected):
        raise HTTPException(401, "Invalid Meta webhook signature")


async def _save_inbound(
    *, provider: str, external_account_id: str, external_customer_id: str,
    external_message_id: str | None, text: str, customer_name: str | None = None,
    message_type: str = "text", raw_event: dict | None = None,
):
    connection = await db.channel_connections.find_one(
        {"provider": provider, "external_account_id": external_account_id, "status": "connected"},
        {"_id": 0},
    )
    if not connection:
        return False
    seller_id = connection["seller_id"]
    existing = None
    if external_message_id:
        existing = await db.messages.find_one({"external_message_id": external_message_id}, {"_id": 0, "id": 1})
    if existing:
        return True

    conversation_query = {
        "seller_id": seller_id,
        "provider": provider,
        "external_account_id": external_account_id,
        "external_customer_id": external_customer_id,
    }
    conversation = await db.conversations.find_one(conversation_query, {"_id": 0})
    conversation_id = (conversation or {}).get("id") or new_id("conv_")
    stamp = now_iso()
    await db.conversations.update_one(
        conversation_query,
        {
            "$set": {
                "id": conversation_id,
                **conversation_query,
                "customer_name": customer_name or (conversation or {}).get("customer_name") or f"{provider.title()} customer",
                "last_message": text,
                "last_message_at": stamp,
                "updated_at": stamp,
            },
            "$inc": {"unread_count": 1},
            "$setOnInsert": {"created_at": stamp},
        },
        upsert=True,
    )
    message = {
        "id": new_id("msg_"),
        "conversation_id": conversation_id,
        "seller_id": seller_id,
        "provider": provider,
        "direction": "inbound",
        "external_message_id": external_message_id,
        "message_type": message_type,
        "text": text,
        "status": "received",
        "created_at": stamp,
    }
    if raw_event is not None:
        message["provider_payload"] = raw_event
    await db.messages.insert_one(message)
    return True


def _whatsapp_text(message):
    msg_type = message.get("type") or "unknown"
    if msg_type == "text":
        return (message.get("text") or {}).get("body") or ""
    if msg_type == "button":
        return (message.get("button") or {}).get("text") or "[Button reply]"
    if msg_type == "interactive":
        interactive = message.get("interactive") or {}
        reply = interactive.get("button_reply") or interactive.get("list_reply") or {}
        return reply.get("title") or reply.get("id") or "[Interactive reply]"
    return f"[{msg_type} message]"


@router.get("/integrations/meta/webhook")
async def verify_meta_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    verify_token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    expected = os.getenv("META_WEBHOOK_VERIFY_TOKEN")
    if mode == "subscribe" and expected and verify_token == expected:
        try:
            return int(challenge) if challenge is not None else 0
        except ValueError:
            return challenge or ""
    raise HTTPException(403, "Webhook verification failed")


@router.post("/integrations/meta/webhook")
async def meta_webhook(request: Request):
    raw = await request.body()
    _verify_meta_signature(raw, request.headers.get("x-hub-signature-256"))
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(400, "Invalid webhook JSON") from exc

    handled = 0
    if payload.get("object") == "page":
        for entry in payload.get("entry") or []:
            page_id = str(entry.get("id") or "")
            for event in entry.get("messaging") or []:
                message = event.get("message") or {}
                if message.get("is_echo"):
                    continue
                sender_id = str((event.get("sender") or {}).get("id") or "")
                if not sender_id or not page_id or not message:
                    continue
                text = message.get("text") or f"[{message.get('attachments') and 'Attachment' or 'Message'}]"
                saved = await _save_inbound(
                    provider="messenger",
                    external_account_id=page_id,
                    external_customer_id=sender_id,
                    external_message_id=message.get("mid"),
                    text=text,
                    message_type="text" if message.get("text") else "attachment",
                    raw_event=event,
                )
                handled += int(saved)

    if payload.get("object") == "whatsapp_business_account":
        for entry in payload.get("entry") or []:
            for change in entry.get("changes") or []:
                value = change.get("value") or {}
                metadata = value.get("metadata") or {}
                phone_number_id = str(metadata.get("phone_number_id") or "")
                contacts = {str(c.get("wa_id") or ""): (c.get("profile") or {}).get("name") for c in value.get("contacts") or []}
                for message in value.get("messages") or []:
                    customer_id = str(message.get("from") or "")
                    if not customer_id or not phone_number_id:
                        continue
                    saved = await _save_inbound(
                        provider="whatsapp",
                        external_account_id=phone_number_id,
                        external_customer_id=customer_id,
                        external_message_id=message.get("id"),
                        text=_whatsapp_text(message),
                        customer_name=contacts.get(customer_id),
                        message_type=message.get("type") or "unknown",
                        raw_event=message,
                    )
                    handled += int(saved)

    return {"ok": True, "handled": handled}
