import os
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request

import conversational_commerce
import seller
from db import db
from security import require_role

router = APIRouter()
seller_dep = require_role("seller")


async def ensure_indexes():
    """Keep provider message IDs unique without indexing null outbound IDs."""
    info = await db.messages.index_information()
    existing = info.get("external_message_id_1")
    expected_partial = {"external_message_id": {"$type": "string"}}
    if existing and existing.get("partialFilterExpression") != expected_partial:
        await db.messages.drop_index("external_message_id_1")
        existing = None
    if not existing:
        await db.messages.create_index(
            "external_message_id",
            name="external_message_id_1",
            unique=True,
            partialFilterExpression=expected_partial,
        )


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
            {"_id": 0, "risk_hold": 1, "risk_review_status": 1},
        )
        if not order:
            raise HTTPException(404, "Order not found")
        if order.get("risk_hold"):
            raise HTTPException(
                409,
                "This order is on Fraud Shield review hold. Approve or dismiss the risk review before confirming it.",
            )
    return await seller.seller_order_action(order_id, body, user)
