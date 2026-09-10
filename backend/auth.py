from fastapi import APIRouter, HTTPException, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field
import requests

from db import db, NO_ID, new_id, now_iso
from security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from access_security import ensure_account_allowed, ensure_ip_allowed, record_auth_event

router = APIRouter()

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


class RegisterBody(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=6)
    role: str = "customer"


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class GoogleBody(BaseModel):
    session_id: str
    role: str = "customer"


def _public_user(u: dict) -> dict:
    clean = dict(u)
    clean.pop("password_hash", None)
    clean.setdefault("status", "active")
    clean.setdefault("trust_badge", "none")
    clean.setdefault("risk_flag", "none")
    return clean


async def _build_auth_payload(user: dict) -> dict:
    token = create_access_token(user["id"], user["email"], user["role"])
    seller_setup = None
    if user["role"] == "seller":
        profile = await db.seller_profiles.find_one({"user_id": user["id"]}, NO_ID)
        seller_setup = {
            "onboarding_complete": bool(profile and profile.get("onboarding_complete")),
        }
    return {"token": token, "user": _public_user(user), "seller_setup": seller_setup}


@router.post("/auth/register")
async def register(body: RegisterBody, request: Request, response: Response):
    email = body.email.lower().strip()
    role = body.role if body.role in ("customer", "seller") else "customer"
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
    await record_auth_event(request, event="register", user=user, success=True)
    fresh = await db.users.find_one({"id": user["id"]}, NO_ID) or user
    return await _build_auth_payload(fresh)


@router.post("/auth/login")
async def login(body: LoginBody, request: Request):
    email = body.email.lower().strip()
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
    return await _build_auth_payload(fresh)


@router.post("/auth/google")
async def google_auth(body: GoogleBody, request: Request):
    role = body.role if body.role in ("customer", "seller") else "customer"
    await ensure_ip_allowed(request, role)
    try:
        resp = requests.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id}, timeout=20)
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
    await record_auth_event(request, event="google_login", user=user, success=True)
    fresh = await db.users.find_one({"id": user["id"]}, NO_ID) or user
    return await _build_auth_payload(fresh)


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    seller_setup = None
    if user["role"] == "seller":
        profile = await db.seller_profiles.find_one({"user_id": user["id"]}, NO_ID)
        seller_setup = {"onboarding_complete": bool(profile and profile.get("onboarding_complete"))}
    return {"user": user, "seller_setup": seller_setup}


@router.post("/auth/logout")
async def logout():
    return {"ok": True}
