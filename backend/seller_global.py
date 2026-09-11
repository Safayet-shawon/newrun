from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from db import db, now_iso
from security import require_role
from global_core import SUPPORTED_CURRENCIES, normalize_country

router = APIRouter()
seller_dep = require_role("seller")


class GlobalSellerSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    origin_country: str = Field(default="BD", min_length=2, max_length=2)
    preferred_currency: str = Field(default="BDT", min_length=3, max_length=3)
    ships_international: bool = False
    allowed_countries: list[str] = Field(default_factory=list, max_length=250)
    domestic_fee_bdt: float = Field(default=60, ge=0, le=1_000_000)
    international_fee_bdt: float = Field(default=1500, ge=0, le=10_000_000)
    free_shipping_over_bdt: float = Field(default=2000, ge=0, le=100_000_000)
    processing_days: int = Field(default=2, ge=0, le=60)


async def _shop_for(user_id: str):
    shop = await db.shops.find_one({"seller_id": user_id}, {"_id": 0})
    if not shop:
        raise HTTPException(400, "Complete seller onboarding first")
    return shop


def _payload(shop: dict):
    cfg = shop.get("shipping_config") or {}
    return {
        "origin_country": normalize_country(cfg.get("origin_country") or shop.get("country_code") or "BD"),
        "preferred_currency": str(shop.get("settlement_currency") or "BDT").upper(),
        "ships_international": bool(cfg.get("ships_international", False)),
        "allowed_countries": cfg.get("allowed_countries") or [],
        "domestic_fee_bdt": float(cfg.get("domestic_fee_bdt", 60) or 0),
        "international_fee_bdt": float(cfg.get("international_fee_bdt", 1500) or 0),
        "free_shipping_over_bdt": float(cfg.get("free_shipping_over_bdt", 2000) or 0),
        "processing_days": int(cfg.get("processing_days", 2) or 0),
    }


@router.get("/seller/global-settings")
async def get_global_settings(user=Depends(seller_dep)):
    return _payload(await _shop_for(user["id"]))


@router.put("/seller/global-settings")
async def update_global_settings(body: GlobalSellerSettings, user=Depends(seller_dep)):
    shop = await _shop_for(user["id"])
    currency = body.preferred_currency.upper()
    if currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(422, "Unsupported preferred currency")
    origin = normalize_country(body.origin_country)
    allowed = []
    for value in body.allowed_countries:
        code = normalize_country(value)
        if code not in allowed and code != origin:
            allowed.append(code)
    shipping = {
        "origin_country": origin,
        "ships_international": body.ships_international,
        "allowed_countries": allowed,
        "domestic_fee_bdt": body.domestic_fee_bdt,
        "international_fee_bdt": body.international_fee_bdt,
        "free_shipping_over_bdt": body.free_shipping_over_bdt,
        "processing_days": body.processing_days,
    }
    await db.shops.update_one(
        {"id": shop["id"]},
        {"$set": {
            "country_code": origin,
            "settlement_currency": currency,
            "shipping_config": shipping,
            "updated_at": now_iso(),
        }},
    )
    return _payload(await _shop_for(user["id"]))
