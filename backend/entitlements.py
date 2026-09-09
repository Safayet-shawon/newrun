import os
"""Central feature-entitlement configuration. Single source of truth for plan gating."""

PLAN_ORDER = ["start", "grow", "pro"]

PLANS = {
    "start": {
        "id": "start",
        "name": "START",
        "price_bdt": 500,
        "recommended": False,
        "tagline": "Start selling",
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
            "transaction_fee": None,
        },
    },
    "grow": {
        "id": "grow",
        "name": "GROW",
        "price_bdt": 1500,
        "recommended": True,
        "tagline": "Grow your business",
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
            "transaction_fee": None,
        },
    },
    "pro": {
        "id": "pro",
        "name": "PRO",
        "price_bdt": 3000,
        "recommended": False,
        "tagline": "Nexora Intelligence + automation",
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
            "transaction_fee": None,
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
