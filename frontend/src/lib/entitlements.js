// Frontend mirror of backend entitlements for instant UI gating (single source pattern).
export const PLAN_META = {
  start: { id: "start", name: "START", price: 500, color: "#66736B" },
  grow: { id: "grow", name: "GROW", price: 1500, color: "#10B981" },
  pro: { id: "pro", name: "PRO", price: 3000, color: "#F59E0B" },
};

export const PLAN_ORDER = ["start", "grow", "pro"];

export function planRank(plan) {
  return PLAN_ORDER.indexOf(plan);
}

// Given the entitlements object from backend, check a feature.
export function can(entitlements, feature) {
  if (!entitlements) return false;
  return !!entitlements[feature];
}

// Human labels for locked-feature messaging.
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
};

export function requiredPlanFor(feature) {
  const grow = ["theme_switching", "custom_accent_color", "advanced_analytics", "bulk_management", "marketing_tools", "customer_insights", "abandoned_cart", "staff_accounts"];
  const pro = ["custom_css", "ai_features", "priority_support"];
  if (pro.includes(feature)) return "pro";
  if (grow.includes(feature)) return "grow";
  return "start";
}
