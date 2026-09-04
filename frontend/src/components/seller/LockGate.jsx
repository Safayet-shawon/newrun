import React from "react";
import { Link } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";
import { requiredPlanFor, FEATURE_LABELS } from "@/lib/entitlements";

// Central locked-feature gate. Wrap any premium section with this.
export default function LockGate({ feature, entitlements, children, inline }) {
  const allowed = entitlements ? !!entitlements[feature] : false;
  if (allowed) return children;
  const plan = requiredPlanFor(feature).toUpperCase();

  if (inline) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3E2] px-2 py-0.5 text-xs font-semibold text-nexora-amber" data-testid={`locked-${feature}`}>
        <Lock size={11} /> {plan}
      </span>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-nexora-amber/50 bg-[#FFFCF5] p-6 text-center" data-testid={`locked-${feature}`}>
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#FEF3E2] text-nexora-amber"><Lock size={22} /></div>
      <h4 className="mt-3 font-bold text-nexora-ink">{FEATURE_LABELS[feature] || "Premium feature"}</h4>
      <p className="mx-auto mt-1 max-w-sm text-sm text-nexora-muted">Available on the <span className="font-semibold text-nexora-ink">{plan}</span> plan and above. Upgrade to unlock this feature.</p>
      <Link to="/seller/dashboard/subscription" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-nexora-amber px-5 py-2 text-sm font-semibold text-white hover:opacity-90" data-testid={`upgrade-${feature}`}>
        <Sparkles size={15} /> Upgrade to {plan}
      </Link>
    </div>
  );
}
