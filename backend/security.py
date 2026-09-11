import os
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import Request, HTTPException, Depends

from db import db, NO_ID
from access_security import ensure_account_allowed, ensure_ip_allowed

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "30"))


def _secret() -> str:
    secret = os.environ["JWT_SECRET"]
    if len(secret) < 32 and os.getenv("APP_ENV", "development").lower() == "production":
        raise RuntimeError("JWT_SECRET must be at least 32 characters in production")
    return secret


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str, session_version: int = 0) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "sv": int(session_version or 0),
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def _extract_token(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.cookies.get("access_token")


async def get_current_user(request: Request) -> dict:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise jwt.InvalidTokenError("wrong token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, NO_ID)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if int(payload.get("sv", 0)) != int(user.get("session_version", 0) or 0):
        raise HTTPException(status_code=401, detail="Session has been revoked")
    if user.get("role") != "admin":
        await ensure_ip_allowed(request, user.get("role"))
        ensure_account_allowed(user)
    user.pop("password_hash", None)
    user.setdefault("status", "active")
    user.setdefault("trust_badge", "none")
    user.setdefault("risk_flag", "none")
    user.setdefault("email_verified", False)
    return user


async def optional_user(request: Request):
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


def require_role(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] not in roles and user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return dep
