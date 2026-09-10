import os
import ipaddress
from datetime import datetime, timezone
from fastapi import HTTPException, Request

from db import db, new_id, now_iso


def _clean_ip(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw:
        return "unknown"
    if raw.startswith("[") and "]" in raw:
        raw = raw[1:raw.index("]")]
    elif raw.count(":") == 1 and "." in raw:
        raw = raw.split(":", 1)[0]
    try:
        return str(ipaddress.ip_address(raw))
    except Exception:
        return raw[:120]


def get_client_ip(request: Request) -> str:
    """Return a client IP without blindly trusting spoofable proxy headers.

    Set TRUST_PROXY_HEADERS=true only when Nexora is deployed behind a trusted
    reverse proxy that overwrites X-Forwarded-For / X-Real-IP.
    """
    trust_proxy = os.environ.get("TRUST_PROXY_HEADERS", "false").lower() in {"1", "true", "yes", "on"}
    if trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return _clean_ip(forwarded.split(",")[0])
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return _clean_ip(real_ip)
    return _clean_ip(request.client.host if request.client else None)


def _now_dt():
    return datetime.now(timezone.utc)


def _parse_dt(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


async def get_active_ip_ban(ip: str, role: str | None = None):
    if not ip or ip == "unknown":
        return None
    query = {"ip": ip, "active": True}
    ban = await db.ip_bans.find_one(query, {"_id": 0})
    if not ban:
        return None
    scope = ban.get("scope", "all")
    if scope not in {"all", role}:
        return None
    expiry = _parse_dt(ban.get("expires_at"))
    if expiry and expiry <= _now_dt():
        await db.ip_bans.update_one({"id": ban.get("id")}, {"$set": {"active": False, "expired_at": now_iso()}})
        return None
    return ban


async def ensure_ip_allowed(request: Request, role: str | None = None):
    ip = get_client_ip(request)
    ban = await get_active_ip_ban(ip, role)
    if ban:
        raise HTTPException(status_code=403, detail="Access from this network address is blocked by Nexora")
    return ip


def ensure_account_allowed(user: dict):
    status = user.get("status", "active")
    if status == "inactive":
        raise HTTPException(status_code=403, detail="This account is inactive")
    if status == "suspended":
        raise HTTPException(status_code=403, detail="This account is suspended")
    if status == "banned":
        raise HTTPException(status_code=403, detail="This account is banned")


async def record_auth_event(request: Request, *, event: str, email: str | None = None, user: dict | None = None, success: bool = True, detail: str | None = None):
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")[:500]
    entry = {
        "id": new_id("sec_"),
        "event": event,
        "success": bool(success),
        "email": (email or (user or {}).get("email") or "").lower() or None,
        "user_id": (user or {}).get("id"),
        "role": (user or {}).get("role"),
        "ip": ip,
        "user_agent": ua,
        "detail": detail,
        "created_at": now_iso(),
    }
    await db.security_events.insert_one(dict(entry))
    if success and user and user.get("id"):
        await db.users.update_one(
            {"id": user["id"]},
            {
                "$set": {"last_login_ip": ip, "last_login_at": now_iso(), "last_user_agent": ua},
                "$inc": {"login_count": 1},
            },
        )
    return entry


async def ensure_security_indexes():
    try:
        await db.ip_bans.create_index([("ip", 1), ("active", 1)])
        await db.security_events.create_index([("created_at", -1)])
        await db.security_events.create_index([("user_id", 1), ("created_at", -1)])
    except Exception:
        pass
