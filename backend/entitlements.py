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
            "transaction_fee": 5.0,
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
            "transaction_fee": 2.5,
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
            "custom_css": True,
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
            "transaction_fee": 1.0,
        },
    },
}

PLAN_FEATURES = {
    "start": [
        "Digital storefront on NEXORA",
        "Up to 50 products",
        "Basic store customization",
        "Inventory & order management",
        "Basic analytics",
        "Basic coupons",
        "SEO placeholder tools",
    ],
    "grow": [
        "Everything in START",
        "Up to 500 products",
        "Advanced store customization",
        "All 9 storefront theme presets",
        "Advanced analytics & customer insights",
        "Bulk catalog management",
        "Marketing & abandoned-cart tools",
        "Staff accounts",
    ],
    "pro": [
        "Everything in GROW",
        "Unlimited products",
        "Premium themes & custom styling",
        "Custom accent colors & CSS",
        "AI feature entitlements",
        "Advanced automation",
        "Priority Bangladesh support",
    ],
}


def get_plan(plan_id: str) -> dict:
    return PLANS.get(plan_id, PLANS["start"])


def get_entitlements(plan_id: str) -> dict:
    return get_plan(plan_id)["entitlements"]
