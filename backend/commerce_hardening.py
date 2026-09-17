import os
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request

import conversational_commerce
import seller
import growth_os
from db import db, new_id, now_iso
from security import require_role

router = APIRouter()
seller_dep = require_role("seller")


def _require_meta_production_config():
    if os.getenv("APP_ENV", "development").lower() != "production":
        return
    missing = [
        name
        for name in ("META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", "INTEGRATION_ENCRYPTION_SECRET")
        if not os.getenv(name)
    ]
    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"Meta commerce integration is not configured: {', '.join(missing)}",
        )


@router.get("/integrations/meta/webhook")
async def guarded_meta_webhook_verify(request: Request):
    _require_meta_production_config()
    return await conversational_commerce.verify_meta_webhook(request)


@router.post("/integrations/meta/webhook")
async def guarded_meta_webhook(request: Request):
    _require_meta_production_config()
    return await conversational_commerce.meta_webhook(request)


@router.post("/seller/inbox/conversations/{conversation_id}/messages")
async def guarded_send_message(
    conversation_id: str,
    body: conversational_commerce.SendMessageBody,
    user: dict = Depends(seller_dep),
):
    conversation = await db.conversations.find_one(
        {"id": conversation_id, "seller_id": user["id"]},
        {"_id": 0},
    )
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

    text = body.text.strip()
    external_id = await conversational_commerce._send_provider_message(
        connection,
        conversation["external_customer_id"],
        text,
    )
    message = {
        "id": new_id("msg_"),
        "conversation_id": conversation_id,
        "seller_id": user["id"],
        "provider": conversation["provider"],
        "direction": "outbound",
        "message_type": "text",
        "text": text,
        "status": "sent",
        "created_at": now_iso(),
    }
    if external_id:
        message["external_message_id"] = external_id
    await db.messages.insert_one(dict(message))
    await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {"last_message": text, "last_message_at": message["created_at"], "updated_at": now_iso()}},
    )
    return message


class GuardedSellerOrderAction(seller.SellerOrderAction):
    action: Literal["confirm", "packed", "ready_for_pickup"]


@router.post("/seller/orders/{order_id}/action")
async def guarded_seller_order_action(
    order_id: str,
    body: GuardedSellerOrderAction,
    user: dict = Depends(seller_dep),
):
    if body.action == "confirm":
        order = await db.orders.find_one(
            {"id": order_id, "seller_id": user["id"]},
            {"_id": 0},
        )
        if not order:
            raise HTTPException(404, "Order not found")
        order = await growth_os.ensure_order_decision(order)
        if order.get("risk_hold"):
            raise HTTPException(
                409,
                "This order is on Fraud Shield review hold. Approve or dismiss the risk review before confirming it.",
            )
        if order.get("operational_hold"):
            decision = order.get("fraud_decision") or {}
            action = str(decision.get("action") or "verification").replace("_", " ")
            raise HTTPException(
                409,
                f"Growth OS requires {action} before this order can be confirmed.",
            )
    return await seller.seller_order_action(order_id, body, user)
