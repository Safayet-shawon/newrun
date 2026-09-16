// Frontend mirror of backend entitlements for instant UI gating.
export const PLAN_META = {
  free: { id: "free", name: "FREE", price: 0, color: "#0F8A68", tagline: "Try Nexora" },
  start: { id: "start", name: "START", price: 500, color: "#66736B", tagline: "Start selling" },
  grow: { id: "grow", name: "GROW", price: 1500, color: "#10B981", tagline: "Grow your business" },
  pro: { id: "pro", name: "PRO", price: 3000, color: "#F59E0B", tagline: "Nexora Intelligence" },
};

export const PLAN_ORDER = ["free", "start", "grow", "pro"];

export function planRank(plan) {
  return PLAN_ORDER.indexOf(plan);
}

export function can(entitlements, feature) {
  if (!entitlements) return false;
  return !!entitlements[feature];
}

export const FEATURE_LABELS = {
  theme_switching: "Switch storefront themes",
  custom_accent_color: "Custom brand colors",
  custom_css: "Custom CSS styling",
  advanced_analytics: "Advanced analytics",
  bulk_management: "Bulk catalog management",
  marketing_tools: "Marketing tools",
  customer_insights: "Customer insights",
  abandoned_cart: "Abandoned cart recovery",
  staff_accounts: "Staff accounts",
  ai_features: "AI feature suite",
  priority_support: "Priority support",
  marketplace_intelligence: "Nexora Marketplace Intelligence",
  demand_analysis: "Marketplace demand analysis",
  competitor_benchmark: "Anonymous marketplace benchmarking",
  ai_product_suggestions: "AI product opportunity suggestions",
  ai_pricing: "AI pricing intelligence",
  store_import: "Import an existing website",
  auto_store_sync: "Automatic store sync",
};

export function requiredPlanFor(feature) {
  const grow = [
    "theme_switching",
    "custom_accent_color",
    "advanced_analytics",
    "bulk_management",
    "marketing_tools",
    "customer_insights",
    "abandoned_cart",
    "staff_accounts",
  ];
  const pro = [
    "custom_css",
    "ai_features",
    "priority_support",
    "marketplace_intelligence",
    "demand_analysis",
    "competitor_benchmark",
    "ai_product_suggestions",
    "ai_pricing",
    "store_import",
    "auto_store_sync",
  ];
  if (pro.includes(feature)) return "pro";
  if (grow.includes(feature)) return "grow";
  return "free";
}
