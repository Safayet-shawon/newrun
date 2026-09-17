"""Shared courier status normalization.

Keep provider wording differences away from order workflow state. In particular,
"pickup pending" is not the same as "picked up".
"""


def normalize(payload):
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
    if any(x in raw for x in ("pickup pending", "awaiting pickup", "pickup request", "pickup requested")):
        return "pickup_requested"
    if any(x in raw for x in ("transit", "on the way", "out for delivery", "delivery ongoing")):
        return "in_transit"
    if any(x in raw for x in ("picked up", "pickedup", "received at", "hub", "warehouse")):
        return "picked_up"
    if any(x in raw for x in ("fail", "hold")):
        return "failed"
    return "pickup_requested"
