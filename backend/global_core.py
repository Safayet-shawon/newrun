import json
import os
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

# Nexora stores current catalogue/order monetary values in BDT minor units.
# FX is deliberately configuration-driven: production must supply fresh rates
# rather than silently shipping stale hard-coded exchange rates.
SUPPORTED_CURRENCIES = {
    "BDT": {"name": "Bangladeshi Taka", "symbol": "৳", "minor_unit": 2},
    "USD": {"name": "US Dollar", "symbol": "$", "minor_unit": 2},
    "EUR": {"name": "Euro", "symbol": "€", "minor_unit": 2},
    "GBP": {"name": "British Pound", "symbol": "£", "minor_unit": 2},
    "AUD": {"name": "Australian Dollar", "symbol": "A$", "minor_unit": 2},
    "CAD": {"name": "Canadian Dollar", "symbol": "C$", "minor_unit": 2},
    "SGD": {"name": "Singapore Dollar", "symbol": "S$", "minor_unit": 2},
    "JPY": {"name": "Japanese Yen", "symbol": "¥", "minor_unit": 0},
    "INR": {"name": "Indian Rupee", "symbol": "₹", "minor_unit": 2},
}


def _decimal_env(name: str, default: str) -> Decimal:
    try:
        return Decimal(str(os.getenv(name, default)))
    except (InvalidOperation, ValueError):
        return Decimal(default)


def configured_fx_rates() -> dict[str, Decimal]:
    """Return rates expressed as 1 BDT = X target currency.

    Example production value:
    FX_RATES_JSON={"BDT":1,"USD":0.0082,"EUR":0.0070}
    Keep BDT=1. Rates should be refreshed by deployment automation/provider.
    """
    rates: dict[str, Decimal] = {"BDT": Decimal("1")}
    raw = os.getenv("FX_RATES_JSON", "").strip()
    if not raw:
        return rates
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return rates
    if not isinstance(parsed, dict):
        return rates
    for code, value in parsed.items():
        code = str(code).upper()
        if code not in SUPPORTED_CURRENCIES:
            continue
        try:
            number = Decimal(str(value))
        except (InvalidOperation, ValueError):
            continue
        if number > 0:
            rates[code] = number
    rates["BDT"] = Decimal("1")
    return rates


def convert_amount(amount: Decimal | float | int, from_currency: str, to_currency: str) -> Decimal:
    source = str(from_currency or "BDT").upper()
    target = str(to_currency or "BDT").upper()
    rates = configured_fx_rates()
    if source not in rates or target not in rates:
        raise ValueError("Exchange rate is not configured for this currency")
    value = Decimal(str(amount))
    amount_bdt = value / rates[source]
    converted = amount_bdt * rates[target]
    decimals = SUPPORTED_CURRENCIES[target]["minor_unit"]
    quantum = Decimal("1") if decimals == 0 else Decimal("0.01")
    return converted.quantize(quantum, rounding=ROUND_HALF_UP)


def normalize_country(value: Optional[str]) -> str:
    code = (value or os.getenv("DEFAULT_COUNTRY_CODE", "BD")).strip().upper()
    if not code or len(code) > 2:
        return "BD"
    return code


def shipping_for_shop(shop: dict, address: dict, subtotal_paisa: int) -> int:
    """Calculate delivery fee independently for one seller/shop.

    Shop-level shipping_config can override environment defaults. All returned
    values are BDT paisa so existing checkout accounting stays deterministic.
    """
    cfg = shop.get("shipping_config") or {}
    origin = normalize_country(cfg.get("origin_country") or shop.get("country_code") or "BD")
    destination = normalize_country(address.get("country_code") or address.get("country") or "BD")
    domestic = origin == destination

    allowed = [str(x).upper() for x in (cfg.get("allowed_countries") or []) if x]
    if not domestic:
        if cfg.get("ships_international") is False:
            raise ValueError(f"{shop.get('name', 'This shop')} does not ship internationally")
        if allowed and destination not in allowed:
            raise ValueError(f"{shop.get('name', 'This shop')} does not ship to {destination}")

    free_over_bdt = Decimal(str(cfg.get("free_shipping_over_bdt", os.getenv("FREE_DELIVERY_OVER_BDT", "2000")) or 0))
    if free_over_bdt > 0 and Decimal(subtotal_paisa) >= free_over_bdt * 100:
        return 0

    if domestic:
        fee_bdt = Decimal(str(cfg.get("domestic_fee_bdt", os.getenv("DELIVERY_FEE_BDT", "60")) or 0))
    else:
        fee_bdt = Decimal(str(cfg.get("international_fee_bdt", os.getenv("INTERNATIONAL_DELIVERY_FEE_BDT", "1500")) or 0))
    return max(0, int((fee_bdt * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)))


def global_config_payload() -> dict:
    rates = configured_fx_rates()
    default_currency = os.getenv("DEFAULT_CURRENCY", "BDT").upper()
    if default_currency not in SUPPORTED_CURRENCIES:
        default_currency = "BDT"
    return {
        "default_country_code": normalize_country(os.getenv("DEFAULT_COUNTRY_CODE", "BD")),
        "default_currency": default_currency,
        "catalogue_settlement_currency": "BDT",
        "currencies": [
            {
                "code": code,
                **meta,
                "rate_from_bdt": float(rates[code]) if code in rates else None,
                "enabled": code in rates,
            }
            for code, meta in SUPPORTED_CURRENCIES.items()
        ],
        "international_shipping_enabled": os.getenv("INTERNATIONAL_SHIPPING_ENABLED", "true").lower() in {"1", "true", "yes", "on"},
    }


@router.get("/global/config")
async def global_config():
    return global_config_payload()


@router.get("/global/currency/convert")
async def currency_convert(
    amount: float = Query(ge=0),
    from_currency: str = "BDT",
    to_currency: str = "BDT",
):
    source = from_currency.upper()
    target = to_currency.upper()
    if source not in SUPPORTED_CURRENCIES or target not in SUPPORTED_CURRENCIES:
        raise HTTPException(422, "Unsupported currency")
    try:
        converted = convert_amount(amount, source, target)
    except ValueError as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"amount": amount, "from": source, "to": target, "converted": float(converted)}
