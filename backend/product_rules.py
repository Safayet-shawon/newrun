"""Product option validation shared by quote, checkout and seller catalogue writes."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from decimal import Decimal, InvalidOperation
from fastapi import HTTPException

PRODUCT_TYPES = {"general", "apparel", "footwear", "cake", "watch"}

def paisa(value):
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount < 0 or amount > 100000000:
            raise ValueError()
        return int((amount * 100).quantize(Decimal("1")))
    except (ValueError, InvalidOperation, TypeError):
        raise HTTPException(422, "Invalid product price")

def validate_product(product):
    if not str(product.get("title", "")).strip():
        raise HTTPException(422, "Product title is required")
    base = paisa(product.get("price"))
    discount = product.get("discount_price")
    if discount is not None and paisa(discount) > base:
        raise HTTPException(422, "Discount price cannot exceed regular price")
    if product.get("stock", 0) < 0:
        raise HTTPException(422, "Stock cannot be negative")
    if product.get("status") not in ("draft", "published", "archived"):
        raise HTTPException(422, "Invalid publication status")
    if product.get("product_type", "general") not in PRODUCT_TYPES:
        raise HTTPException(422, "Invalid product type")
    names = set()
    for variant in product.get("variants", []):
        name, options = variant.get("name", "").strip(), variant.get("options", [])
        if not name or name in names or not options or len(options) > 50 or any(not isinstance(o,str) or not o.strip() for o in options):
            raise HTTPException(422, "Each option needs a unique name and nonempty choices")
        names.add(name)
    combinations = set()
    for variant in product.get("variant_inventory", []):
        chosen = variant.get("options", {})
        if set(chosen) != names or any(chosen[v["name"]] not in v["options"] for v in product.get("variants", [])):
            raise HTTPException(422, "Inventory must match all product option choices")
        key = tuple(sorted(chosen.items()))
        if key in combinations or variant.get("stock", 0) < 0:
            raise HTTPException(422, "Duplicate variant or invalid stock")
        combinations.add(key)
        if variant.get("price") is not None:
            paisa(variant["price"])
    fulfillment = product.get("fulfillment", {})
    if not 0 <= fulfillment.get("lead_time_days", 0) <= 365:
        raise HTTPException(422, "Lead time must be between 0 and 365 days")
    return product

def resolve_selection(product, item):
    """Reject incomplete/tampered choices; never accept a client-supplied price."""
    choices = dict(item.options or {})
    variants = product.get("variants", [])
    if not choices and item.variant:
        values = item.variant.split("/")
        if len(values) == len(variants):
            choices = {v["name"]: value for v,value in zip(variants,values)}
    if set(choices) != {v["name"] for v in variants}:
        raise HTTPException(422, f"Choose all options for {product['title']}")
    for v in variants:
        if choices[v["name"]] not in v["options"]:
            raise HTTPException(422, f"Invalid {v['name']} for {product['title']}")
    price = product.get("discount_price")
    if price is None:
        price = product["price"]
    inventory_index = None
    if product.get("variant_inventory"):
        for index, variant in enumerate(product["variant_inventory"]):
            if variant["options"] == choices:
                inventory_index = index
                if variant.get("price") is not None:
                    price = variant["price"]
                break
        if inventory_index is None:
            raise HTTPException(409, "This combination is not available")
    custom = dict(item.customization or {})
    allowed = set()
    fulfillment = product.get("fulfillment", {})
    if product.get("product_type") == "cake":
        allowed.add("delivery_date")
        try:
            requested = datetime.strptime(custom.get("delivery_date", ""), "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(422, "Select a delivery date for your cake")
        earliest = datetime.now(ZoneInfo("Asia/Dhaka")).date() + timedelta(days=fulfillment.get("lead_time_days", 1))
        available = fulfillment.get("available_dates", [])
        if requested < earliest or requested.isoformat() in fulfillment.get("unavailable_dates", []) or (available and requested.isoformat() not in available):
            raise HTTPException(409, "Selected cake date is unavailable or before the preparation lead time")
        if fulfillment.get("allow_message", True):
            allowed.add("message")
            if len(custom.get("message", "")) > fulfillment.get("max_message_length", 80):
                raise HTTPException(422, "Cake message is too long")
    if set(custom) - allowed:
        raise HTTPException(422, "Unsupported customization fields")
    return choices, custom, paisa(price), inventory_index
