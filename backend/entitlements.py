import os
"""Central feature-entitlement configuration. Single source of truth for plan gating."""

PLAN_ORDER = ["free", "start", "grow", "pro"]

PLANS = {
    "free": {
        "id": "free",
        "name": "FREE",
        "price_bdt": 0,
        "recommended": False,
        "tagline": "Try Nexora and make your first sales",
        "commission_percent": 10,
        "entitlements": {
            "max_products": 10,
            "theme_switching": False,
            "theme_access": "essential",
            "custom_accent_color": False,
            "custom_css": False,
            "collections_limit": 1,
            "sections_limit": 4,
            "advanced_analytics": False,
            "bulk_management": False,
            "marketing_tools": False,
            "customer_insights": False,
            "abandoned_cart": False,
            "staff_accounts": False,
            "ai_features": False,
            "priority_support": False,
            "marketplace_intelligence": False,
            "demand_analysis": False,
            "competitor_benchmark": False,
            "ai_product_suggestions": False,
            "ai_pricing": False,
            "store_import": False,
            "auto_store_sync": False,
            "transaction_fee": 10,
        },
    },
    "start": {
        "id": "start",
        "name": "START",
        "price_bdt": 500,
        "recommended": False,
        "tagline": "Start selling",
        "commission_percent": 7,
        "entitlements": {
            "max_products": 50,
            "theme_switching": False,
            "theme_access": "essential",
            "custom_accent_color": False,
            "custom_css": False,
            "collections_limit": 2,
            "sections_limit": 4,
            "advanced_analytics": False,
            "bulk_management": False,
            "marketing_tools": False,
            "customer_insights": False,
            "abandoned_cart": False,
            "staff_accounts": False,
            "ai_features": False,
            "priority_support": False,
            "marketplace_intelligence": False,
            "demand_analysis": False,
            "competitor_benchmark": False,
            "ai_product_suggestions": False,
            "ai_pricing": False,
            "store_import": False,
            "auto_store_sync": False,
            "transaction_fee": 7,
        },
    },
    "grow": {
        "id": "grow",
        "name": "GROW",
        "price_bdt": 1500,
        "recommended": True,
        "tagline": "Grow your business",
        "commission_percent": 5,
        "entitlements": {
            "max_products": 500,
            "theme_switching": True,
            "theme_access": "all",
            "custom_accent_color": True,
            "custom_css": False,
            "collections_limit": 10,
            "sections_limit": 10,
            "advanced_analytics": True,
            "bulk_management": True,
            "marketing_tools": True,
            "customer_insights": True,
            "abandoned_cart": True,
            "staff_accounts": True,
            "ai_features": False,
            "priority_support": False,
            "marketplace_intelligence": False,
            "demand_analysis": False,
            "competitor_benchmark": False,
            "ai_product_suggestions": False,
            "ai_pricing": False,
            "store_import": False,
            "auto_store_sync": False,
            "transaction_fee": 5,
        },
    },
    "pro": {
        "id": "pro",
        "name": "PRO",
        "price_bdt": 3000,
        "recommended": False,
        "tagline": "Nexora Intelligence + automation",
        "commission_percent": 3,
        "entitlements": {
            "max_products": -1,
            "theme_switching": True,
            "theme_access": "premium",
            "custom_accent_color": True,
            "custom_css": False,
            "collections_limit": -1,
            "sections_limit": -1,
            "advanced_analytics": True,
            "bulk_management": True,
            "marketing_tools": True,
            "customer_insights": True,
            "abandoned_cart": True,
            "staff_accounts": True,
            "ai_features": True,
            "priority_support": True,
            "marketplace_intelligence": True,
            "demand_analysis": True,
            "competitor_benchmark": True,
            "ai_product_suggestions": True,
            "ai_pricing": True,
            "store_import": True,
            "auto_store_sync": True,
            "transaction_fee": 3,
        },
    },
}

# Keep the current project's existing behaviour.
PLANS["grow"]["entitlements"]["theme_switching"] = False

for plan_id, plan in PLANS.items():
    plan["price_bdt"] = int(os.getenv(f"PLAN_{plan_id.upper()}_BDT", str(plan["price_bdt"])))
    plan["billing_period"] = os.getenv("BILLING_PERIOD") or None
    plan["billing_enabled"] = False
    plan["entitlements"]["logo_upload"] = True
    plan["entitlements"]["cover_upload"] = True
    plan["entitlements"]["layout_customization"] = plan_id == "pro"

PLAN_FEATURES = {
    "free": [
        "Category-specific starter storefront",
        "Up to 10 products",
        "Inventory and order management",
        "Courier-ready seller setup",
        "10% marketplace commission",
    ],
    "start": [
        "Category-specific preset",
        "Logo and cover uploads",
        "Up to 50 products",
        "Inventory and orders",
    ],
    "grow": [
        "Logo and cover uploads",
        "Up to 500 products",
        "Limited brand color customization",
        "Bulk catalogue management",
        "Advanced analytics",
        "Customer insights",
        "Marketing tools",
    ],
    "pro": [
        "Logo and cover uploads",
        "Unlimited products",
        "Theme selection",
        "Full layout, font and color controls",
        "Advanced analytics",
        "Nexora Marketplace Intelligence",
        "Demand vs supply opportunity analysis",
        "Anonymous marketplace pricing benchmarks",
        "AI-assisted recommendations",
        "Import an existing website",
        "Automatic product sync",
        "Priority support",
    ],
}


def get_plan(plan_id: str) -> dict:
    return PLANS.get(plan_id, PLANS["start"])


def get_entitlements(plan_id: str) -> dict:
    return get_plan(plan_id)["entitlements"]
