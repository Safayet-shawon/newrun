from fastapi import APIRouter, HTTPException, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
import requests

from db import db, NO_ID, new_id, now_iso
from security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

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
    u.pop("password_hash", None)
    return u


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
async def register(body: RegisterBody, response: Response):
    email = body.email.lower().strip()
    role = body.role if body.role in ("customer", "seller") else "customer"
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user = {
        "id": new_id("user_"),
        "email": email,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "role": role,
        "picture": None,
        "auth_provider": "password",
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
    return await _build_auth_payload(user)


@router.post("/auth/login")
async def login(body: LoginBody):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, NO_ID)
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return await _build_auth_payload(user)


@router.post("/auth/google")
async def google_auth(body: GoogleBody):
    try:
        resp = requests.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id}, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Google authentication failed")

    email = data["email"].lower().strip()
    role = body.role if body.role in ("customer", "seller") else "customer"
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
        if data.get("picture") and not user.get("picture"):
            await db.users.update_one({"id": user["id"]}, {"$set": {"picture": data["picture"]}})
            user["picture"] = data["picture"]
    return await _build_auth_payload(user)


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
