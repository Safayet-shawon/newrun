import hashlib
import os
import secrets
from datetime import datetime, timezone, timedelta

import requests
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field

from db import db, NO_ID, new_id, now_iso
from security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from access_security import ensure_account_allowed, ensure_ip_allowed, record_auth_event
from email_service import send_email
from rate_limit import check_rate_limit

router = APIRouter()

REFRESH_COOKIE = "nexora_refresh"
REFRESH_DAYS = int(os.getenv("REFRESH_TOKEN_DAYS", "30"))
RESET_MINUTES = int(os.getenv("PASSWORD_RESET_MINUTES", "30"))
VERIFY_HOURS = int(os.getenv("EMAIL_VERIFY_HOURS", "24"))


class RegisterBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str = "customer"


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class GoogleBody(BaseModel):
    session_id: str
    role: str = "customer"


class ForgotPasswordBody(BaseModel):
    email: EmailStr


class ResetPasswordBody(BaseModel):
    token: str = Field(min_length=20, max_length=300)
    password: str = Field(min_length=8, max_length=128)


class TokenBody(BaseModel):
    token: str = Field(min_length=20, max_length=300)


def _utcnow():
    return datetime.now(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _public_user(u: dict) -> dict:
    clean = dict(u)
    clean.pop("password_hash", None)
    clean.setdefault("status", "active")
    clean.setdefault("trust_badge", "none")
    clean.setdefault("risk_flag", "none")
    clean.setdefault("email_verified", False)
    clean.pop("session_version", None)
    return clean


def _cookie_kwargs():
    production = os.getenv("APP_ENV", "development").lower() == "production"
    return {
        "httponly": True,
        "secure": production,
        "samesite": os.getenv("REFRESH_COOKIE_SAMESITE", "lax"),
        "max_age": REFRESH_DAYS * 24 * 60 * 60,
        "path": "/api/auth",
    }


async def _create_refresh_session(user: dict, request: Request, response: Response):
    token = secrets.token_urlsafe(48)
    token_hash = _hash_token(token)
    expires = _utcnow() + timedelta(days=REFRESH_DAYS)
    await db.refresh_sessions.insert_one({
        "id": new_id("sess_"),
        "token_hash": token_hash,
        "user_id": user["id"],
        "role": user.get("role"),
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent", "")[:500],
        "created_at": now_iso(),
        "expires_at": expires,
        "revoked_at": None,
    })
    response.set_cookie(REFRESH_COOKIE, token, **_cookie_kwargs())


def _clear_refresh_cookie(response: Response):
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth", samesite=os.getenv("REFRESH_COOKIE_SAMESITE", "lax"))


async def _build_auth_payload(user: dict, request: Request, response: Response) -> dict:
    token = create_access_token(
        user["id"],
        user["email"],
        user["role"],
        int(user.get("session_version", 0) or 0),
    )
    await _create_refresh_session(user, request, response)
    seller_setup = None
    if user["role"] == "seller":
        profile = await db.seller_profiles.find_one({"user_id": user["id"]}, NO_ID)
        seller_setup = {"onboarding_complete": bool(profile and profile.get("onboarding_complete"))}
    return {"token": token, "user": _public_user(user), "seller_setup": seller_setup}


async def _send_verification(user: dict):
    raw = secrets.token_urlsafe(40)
    expires = _utcnow() + timedelta(hours=VERIFY_HOURS)
    await db.email_tokens.update_many(
        {"user_id": user["id"], "kind": "verify", "used_at": None},
        {"$set": {"used_at": now_iso()}},
    )
    await db.email_tokens.insert_one({
        "id": new_id("evt_"),
        "user_id": user["id"],
        "email": user["email"],
        "kind": "verify",
        "token_hash": _hash_token(raw),
        "expires_at": expires,
        "used_at": None,
        "created_at": now_iso(),
    })
    frontend = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    url = f"{frontend}/verify-email?token={raw}"
    return send_email(
        user["email"],
        "Verify your Nexora email",
        f"Verify your Nexora email: {url}\n\nThis link expires in {VERIFY_HOURS} hours.",
        f'<p>Verify your Nexora email address.</p><p><a href="{url}">Verify email</a></p><p>This link expires in {VERIFY_HOURS} hours.</p>',
    )


@router.post("/auth/register")
async def register(body: RegisterBody, request: Request, response: Response):
    email = body.email.lower().strip()
    role = body.role if body.role in ("customer", "seller") else "customer"
    await check_rate_limit(request, action="register", limit=8, window_seconds=3600, identity=email)
    await ensure_ip_allowed(request, role)
    if await db.users.find_one({"email": email}):
        await record_auth_event(request, event="register", email=email, success=False, detail="email_exists")
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user = {
        "id": new_id("user_"),
        "email": email,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "role": role,
        "picture": None,
        "auth_provider": "password",
        "status": "active",
        "trust_badge": "none",
        "risk_flag": "none",
        "email_verified": False,
        "session_version": 0,
        "login_count": 0,
        "created_at": now_iso(),
    }
    await db.users.insert_one(dict(user))
    if role == "seller":
        await db.seller_profiles.insert_one({
            "id": new_id("sp_"),
            "user_id": user["id"],
            "onboarding_complete": False,
            "created_at": now_iso(),
        })
    try:
        await _send_verification(user)
    except Exception:
        pass
    await record_auth_event(request, event="register", user=user, success=True)
    fresh = await db.users.find_one({"id": user["id"]}, NO_ID) or user
    return await _build_auth_payload(fresh, request, response)


@router.post("/auth/login")
async def login(body: LoginBody, request: Request, response: Response):
    email = body.email.lower().strip()
    await check_rate_limit(request, action="login", limit=12, window_seconds=900, identity=email)
    user = await db.users.find_one({"email": email}, NO_ID)
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        await record_auth_event(request, event="login", email=email, user=user, success=False, detail="invalid_credentials")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("role") != "admin":
        await ensure_ip_allowed(request, user.get("role"))
        try:
            ensure_account_allowed(user)
        except HTTPException as exc:
            await record_auth_event(request, event="login", email=email, user=user, success=False, detail="account_blocked")
            raise exc
    await record_auth_event(request, event="login", user=user, success=True)
    fresh = await db.users.find_one({"id": user["id"]}, NO_ID) or user
    return await _build_auth_payload(fresh, request, response)


@router.post("/auth/google")
async def google_auth(body: GoogleBody, request: Request, response: Response):
    role = body.role if body.role in ("customer", "seller") else "customer"
    await check_rate_limit(request, action="google_login", limit=20, window_seconds=900)
    await ensure_ip_allowed(request, role)
    session_url = os.getenv("GOOGLE_AUTH_SESSION_URL")
    if not session_url:
        if os.getenv("APP_ENV", "development").lower() == "production":
            raise HTTPException(503, "Google authentication is not configured")
        session_url = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
    try:
        resp = requests.get(session_url, headers={"X-Session-ID": body.session_id}, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        await record_auth_event(request, event="google_login", success=False, detail="google_exchange_failed")
        raise HTTPException(status_code=400, detail="Google authentication failed")

    email = data["email"].lower().strip()
    user = await db.users.find_one({"email": email}, NO_ID)
    if not user:
        user = {
            "id": new_id("user_"),
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "password_hash": None,
            "role": role,
            "picture": data.get("picture"),
            "auth_provider": "google",
            "status": "active",
            "trust_badge": "none",
            "risk_flag": "none",
            "email_verified": True,
            "session_version": 0,
            "login_count": 0,
            "created_at": now_iso(),
        }
        await db.users.insert_one(dict(user))
        if role == "seller":
            await db.seller_profiles.insert_one({
                "id": new_id("sp_"),
                "user_id": user["id"],
                "onboarding_complete": False,
                "created_at": now_iso(),
            })
    else:
        ensure_account_allowed(user)
        if data.get("picture") and not user.get("picture"):
            await db.users.update_one({"id": user["id"]}, {"$set": {"picture": data["picture"]}})
            user["picture"] = data["picture"]
        if not user.get("email_verified"):
            await db.users.update_one({"id": user["id"]}, {"$set": {"email_verified": True}})
            user["email_verified"] = True
    await record_auth_event(request, event="google_login", user=user, success=True)
    fresh = await db.users.find_one({"id": user["id"]}, NO_ID) or user
    return await _build_auth_payload(fresh, request, response)


@router.post("/auth/refresh")
async def refresh_session(request: Request, response: Response):
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise HTTPException(401, "Session refresh required")
    token_hash = _hash_token(raw)
    session = await db.refresh_sessions.find_one({"token_hash": token_hash, "revoked_at": None}, NO_ID)
    if not session or session.get("expires_at") <= _utcnow():
        _clear_refresh_cookie(response)
        raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"id": session["user_id"]}, NO_ID)
    if not user:
        _clear_refresh_cookie(response)
        raise HTTPException(401, "User not found")
    if user.get("role") != "admin":
        await ensure_ip_allowed(request, user.get("role"))
        ensure_account_allowed(user)
    await db.refresh_sessions.update_one({"id": session["id"]}, {"$set": {"revoked_at": now_iso(), "replaced_at": now_iso()}})
    return await _build_auth_payload(user, request, response)


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        await db.refresh_sessions.update_many(
            {"token_hash": _hash_token(raw), "revoked_at": None},
            {"$set": {"revoked_at": now_iso()}},
        )
    _clear_refresh_cookie(response)
    return {"ok": True}


@router.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordBody, request: Request):
    email = body.email.lower().strip()
    await check_rate_limit(request, action="forgot_password", limit=5, window_seconds=3600, identity=email)
    user = await db.users.find_one({"email": email}, NO_ID)
    if user and user.get("password_hash"):
        raw = secrets.token_urlsafe(40)
        expires = _utcnow() + timedelta(minutes=RESET_MINUTES)
        await db.email_tokens.update_many(
            {"user_id": user["id"], "kind": "reset", "used_at": None},
            {"$set": {"used_at": now_iso()}},
        )
        await db.email_tokens.insert_one({
            "id": new_id("evt_"),
            "user_id": user["id"],
            "email": email,
            "kind": "reset",
            "token_hash": _hash_token(raw),
            "expires_at": expires,
            "used_at": None,
            "created_at": now_iso(),
        })
        frontend = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
        url = f"{frontend}/reset-password?token={raw}"
        try:
            send_email(
                email,
                "Reset your Nexora password",
                f"Reset your password: {url}\n\nThis link expires in {RESET_MINUTES} minutes.",
                f'<p>Use the link below to reset your Nexora password.</p><p><a href="{url}">Reset password</a></p><p>This link expires in {RESET_MINUTES} minutes.</p>',
            )
        except Exception:
            pass
    return {"ok": True, "message": "If an account exists, a password reset link has been sent."}


@router.post("/auth/reset-password")
async def reset_password(body: ResetPasswordBody, request: Request):
    await check_rate_limit(request, action="reset_password", limit=8, window_seconds=3600)
    token_hash = _hash_token(body.token)
    token = await db.email_tokens.find_one({"token_hash": token_hash, "kind": "reset", "used_at": None}, NO_ID)
    if not token or token.get("expires_at") <= _utcnow():
        raise HTTPException(400, "This reset link is invalid or expired")
    user = await db.users.find_one({"id": token["user_id"]}, NO_ID)
    if not user:
        raise HTTPException(400, "This reset link is invalid or expired")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(body.password), "updated_at": now_iso()}, "$inc": {"session_version": 1}},
    )
    await db.email_tokens.update_one({"id": token["id"]}, {"$set": {"used_at": now_iso()}})
    await db.refresh_sessions.update_many({"user_id": user["id"], "revoked_at": None}, {"$set": {"revoked_at": now_iso()}})
    await record_auth_event(request, event="password_reset", email=user["email"], user=user, success=True)
    return {"ok": True}


@router.post("/auth/verification/send")
async def resend_verification(request: Request, user: dict = Depends(get_current_user)):
    if user.get("email_verified"):
        return {"ok": True, "verified": True}
    await check_rate_limit(request, action="verify_email", limit=4, window_seconds=3600, identity=user["email"])
    fresh = await db.users.find_one({"id": user["id"]}, NO_ID) or user
    try:
        sent = await _send_verification(fresh)
    except Exception:
        sent = False
    return {"ok": True, "sent": sent}


@router.post("/auth/verification/confirm")
async def confirm_verification(body: TokenBody, request: Request):
    await check_rate_limit(request, action="verify_confirm", limit=12, window_seconds=3600)
    token = await db.email_tokens.find_one({"token_hash": _hash_token(body.token), "kind": "verify", "used_at": None}, NO_ID)
    if not token or token.get("expires_at") <= _utcnow():
        raise HTTPException(400, "This verification link is invalid or expired")
    await db.users.update_one({"id": token["user_id"]}, {"$set": {"email_verified": True, "email_verified_at": now_iso()}})
    await db.email_tokens.update_one({"id": token["id"]}, {"$set": {"used_at": now_iso()}})
    return {"ok": True, "verified": True}


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    seller_setup = None
    if user["role"] == "seller":
        profile = await db.seller_profiles.find_one({"user_id": user["id"]}, NO_ID)
        seller_setup = {"onboarding_complete": bool(profile and profile.get("onboarding_complete"))}
    return {"user": _public_user(user), "seller_setup": seller_setup}


async def ensure_auth_indexes():
    try:
        await db.refresh_sessions.create_index("token_hash", unique=True)
        await db.refresh_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.refresh_sessions.create_index([("user_id", 1), ("created_at", -1)])
        await db.email_tokens.create_index("token_hash", unique=True)
        await db.email_tokens.create_index("expires_at", expireAfterSeconds=0)
        await db.email_tokens.create_index([("user_id", 1), ("kind", 1)])
    except Exception:
        pass
