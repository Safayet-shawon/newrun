from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, Request
from pymongo import ReturnDocument

from db import db, now_iso
from access_security import get_client_ip


def _window_start(seconds: int) -> datetime:
    now = datetime.now(timezone.utc)
    epoch = int(now.timestamp())
    start = epoch - (epoch % seconds)
    return datetime.fromtimestamp(start, tz=timezone.utc)


async def check_rate_limit(
    request: Request,
    *,
    action: str,
    limit: int,
    window_seconds: int,
    identity: str | None = None,
):
    """Mongo-backed fixed-window limiter shared across API workers.

    The key combines action + client IP + optional normalized identity. It is
    intentionally used only on abuse-prone endpoints (auth/reset/import etc.).
    """
    ip = get_client_ip(request)
    normalized = (identity or "").strip().lower()[:200]
    window = _window_start(window_seconds)
    key = f"{action}:{ip}:{normalized}:{int(window.timestamp())}"
    expires = window + timedelta(seconds=window_seconds * 2)
    row = await db.rate_limits.find_one_and_update(
        {"key": key},
        {
            "$inc": {"count": 1},
            "$setOnInsert": {
                "key": key,
                "action": action,
                "ip": ip,
                "identity": normalized or None,
                "window_started_at": window.isoformat(),
                "expires_at": expires,
                "created_at": now_iso(),
            },
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    count = int((row or {}).get("count", 1))
    if count > limit:
        retry_after = max(1, int((window + timedelta(seconds=window_seconds) - datetime.now(timezone.utc)).total_seconds()))
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait and try again.",
            headers={"Retry-After": str(retry_after)},
        )


async def ensure_rate_limit_indexes():
    try:
        await db.rate_limits.create_index("key", unique=True)
        await db.rate_limits.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        pass
