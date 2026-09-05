import os
"""Central feature-entitlement configuration. Single source of truth for plan gating."""

PLAN_ORDER = ["start", "grow", "pro"]

PLANS = {
    "start": {
        "id": "start",
        "name": "START",
        "price_bdt": 500,
        "recommended": False,
        "tagline": "Everything you need to launch",
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
            "transaction_fee": None,
        },
    },
    "grow": {
        "id": "grow",
        "name": "GROW",
        "price_bdt": 1500,
        "recommended": True,
        "tagline": "Scale with advanced tools",
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
            "transaction_fee": None,
        },
    },
    "pro": {
        "id": "pro",
        "name": "PRO",
        "price_bdt": 3000,
        "recommended": False,
        "tagline": "Maximum power & flexibility",
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
            "transaction_fee": None,
        },
    },
}

# Draft pricing; billing interval and commissions must be explicitly configured.
PLANS["grow"]["entitlements"]["theme_switching"] = False
for plan_id, plan in PLANS.items():
    plan["price_bdt"] = int(os.getenv(f"PLAN_{plan_id.upper()}_BDT", str(plan["price_bdt"])))
    plan["billing_period"] = os.getenv("BILLING_PERIOD") or None
    plan["billing_enabled"] = False
    plan["entitlements"]["logo_upload"] = True
    plan["entitlements"]["cover_upload"] = True
    plan["entitlements"]["layout_customization"] = plan_id == "pro"
PLAN_FEATURES = {
    "start": ["Category-specific preset", "Logo and cover uploads", "Up to 50 products", "Inventory and orders"],
    "grow": ["Logo and cover uploads", "Up to 500 products", "Limited brand color customization", "Bulk catalogue management", "Customer insights"],
    "pro": ["Logo and cover uploads", "Unlimited products", "Theme selection", "Supported layout, font and color controls", "Advanced analytics"]
}

def get_plan(plan_id: str) -> dict:
    return PLANS.get(plan_id, PLANS["start"])


def get_entitlements(plan_id: str) -> dict:
    return get_plan(plan_id)["entitlements"]
