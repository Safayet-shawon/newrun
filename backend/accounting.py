"""Immutable order-accounting snapshots.

This module records what the platform *would* earn without moving seller money.
Actual settlement remains disabled until payout, refund and tax policies are
approved. Keeping the snapshot on the order makes future settlement auditable.
"""

from entitlements import PLANS


def order_accounting_snapshot(group: dict, plan_id: str, platform_settings: dict) -> dict:
    subtotal = max(0, int(group.get("subtotal_paisa") or 0))
    delivery = max(0, int(group.get("delivery_paisa") or 0))
    configured_rate = float((platform_settings or {}).get("commission_percent") or 0)
    plan_rate = float(PLANS.get(plan_id, PLANS["free"]).get("commission_percent") or 0)
    rate = configured_rate if configured_rate > 0 else plan_rate
    commission = int(round(subtotal * rate / 100))
    order_fee = max(0, int((platform_settings or {}).get("order_fee_paisa") or 0))
    seller_net = max(0, subtotal + delivery - commission - order_fee)
    return {
        "version": 1,
        "currency": "BDT",
        "basis": "item_subtotal",
        "seller_plan": plan_id,
        "gross_paisa": subtotal + delivery,
        "item_subtotal_paisa": subtotal,
        "delivery_paisa": delivery,
        "commission_rate_percent": rate,
        "platform_commission_paisa": commission,
        "platform_order_fee_paisa": order_fee,
        "seller_net_paisa": seller_net,
        "settlement_status": "not_settled",
    }
