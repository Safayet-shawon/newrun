"""Pure transition rules shared by return, refund and courier endpoints."""

RETURN_TRANSITIONS = {
    "requested": {"approved", "rejected"},
    "approved": {"item_received", "cancelled"},
    "item_received": {"refund_pending", "resolved"},
    "refund_pending": {"refunded", "resolved"},
}

COURIER_TRANSITIONS = {
    "awaiting_courier_connection": {"pickup_requested", "cancelled"},
    "pickup_requested": {"picked_up", "failed", "cancelled"},
    "picked_up": {"in_transit", "failed", "returned"},
    "in_transit": {"delivered", "failed", "returned"},
    "failed": {"pickup_requested", "returned", "cancelled"},
}


def require_transition(current: str, target: str, transitions: dict[str, set[str]], label: str) -> str:
    if current == target:
        return target
    if target not in transitions.get(current, set()):
        raise ValueError(f"{label} cannot move from {current} to {target}")
    return target
