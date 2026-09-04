import React, { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import { useSeller } from "@/context/SellerContext";
import { PLAN_META, planRank } from "@/lib/entitlements";
import { toast } from "sonner";

export default function Subscription() {
  const { plan, reload } = useSeller();
  const [plans, setPlans] = useState([]);
  const [features, setFeatures] = useState({});
  const [changing, setChanging] = useState("");

  useEffect(() => { api.get("/subscriptions/plans").then(({ data }) => { setPlans(data.plans); setFeatures(data.features); }); }, []);
  if (!plans.length || !plan) return <Loader />;

  const currentRank = planRank(plan.id);

  const change = async (id) => {
    setChanging(id);
    try {
      await api.post("/seller/subscription", { plan: id });
      await reload();
      toast.success(`Switched to ${id.toUpperCase()} plan`);
    } catch { toast.error("Could not change plan"); } finally { setChanging(""); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-nexora-ink">Subscription</h1>
        <p className="text-sm text-nexora-muted">You're on the <span className="font-bold" style={{ color: PLAN_META[plan.id]?.color }}>{plan.name}</span> plan. Changes activate instantly (test mode — no payment).</p>
      </div>

      <div className="rounded-2xl border border-nexora-emerald/30 bg-nexora-mintbg p-5" data-testid="current-plan-badge">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-nexora-muted">Current plan</p><p className="text-2xl font-extrabold text-nexora-ink">{plan.name} · ৳{plan.price_bdt.toLocaleString()}/mo</p></div>
          <span className="rounded-full bg-nexora-emerald px-3 py-1 text-xs font-semibold text-white">Active (test)</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = p.id === plan.id;
          const rank = planRank(p.id);
          return (
            <div key={p.id} className={`relative flex flex-col rounded-3xl border p-6 ${p.recommended ? "border-nexora-emerald ring-2 ring-nexora-emerald/20" : "border-nexora-border"} bg-white`} data-testid={`plan-card-${p.id}`}>
              {p.recommended && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-nexora-emerald px-3 py-1 text-xs font-bold text-white">MOST POPULAR</span>}
              <p className="text-sm font-bold text-nexora-muted">{p.name}</p>
              <p className="mt-1 text-3xl font-extrabold text-nexora-ink">৳{p.price_bdt.toLocaleString()}<span className="text-sm font-medium text-nexora-muted">/mo</span></p>
              <p className="mt-1 text-sm text-nexora-muted">{p.tagline}</p>
              <ul className="mt-4 flex-1 space-y-2">
                {features[p.id]?.map((f) => <li key={f} className="flex gap-2 text-sm text-nexora-ink"><Check size={16} className="mt-0.5 shrink-0 text-nexora-emerald" /> {f}</li>)}
              </ul>
              <button
                onClick={() => !isCurrent && change(p.id)}
                disabled={isCurrent || changing === p.id}
                className={`mt-5 w-full rounded-full py-2.5 text-sm font-semibold ${isCurrent ? "bg-nexora-mintbg text-nexora-emeraldDark" : rank > currentRank ? "bg-nexora-emerald text-white hover:bg-nexora-emeraldDark" : "border border-nexora-border text-nexora-ink hover:border-nexora-emerald"}`}
                data-testid={`select-plan-${p.id}`}>
                {isCurrent ? "Current plan" : changing === p.id ? "Switching…" : rank > currentRank ? <><Sparkles size={14} className="inline" /> Upgrade</> : "Switch to this"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
