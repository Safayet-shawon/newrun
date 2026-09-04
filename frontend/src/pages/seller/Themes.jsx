import React, { useState } from "react";
import { Check, Lock, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import { useSeller } from "@/context/SellerContext";
import { THEME_PRESETS } from "@/lib/themePresets";
import { toast } from "sonner";

export default function Themes() {
  const { shop, ent, plan, reload } = useSeller();
  const [saving, setSaving] = useState("");
  if (!shop) return <Loader />;

  const canSwitch = ent?.theme_switching;
  const current = shop.theme_preset;

  const apply = async (key) => {
    if (!canSwitch) { toast.error("Upgrade to GROW to switch themes"); return; }
    setSaving(key);
    try { await api.put("/seller/shop", { theme_preset: key }); await reload(); toast.success("Theme applied"); }
    catch { toast.error("Could not apply theme"); } finally { setSaving(""); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-nexora-ink">Storefront themes</h1>
        <p className="text-sm text-nexora-muted">Your category sets a default theme. {canSwitch ? "Switch to any of the 9 presets below." : "Upgrade to GROW to switch presets."}</p>
      </div>

      {!canSwitch && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-nexora-amber/40 bg-[#FFFCF5] p-5 sm:flex-row sm:items-center" data-testid="themes-locked-banner">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#FEF3E2] text-nexora-amber"><Lock size={20} /></div>
            <div><p className="font-bold text-nexora-ink">Theme switching is locked on {plan?.name}</p><p className="text-sm text-nexora-muted">Your storefront uses the {THEME_PRESETS[current]?.name} preset for your category.</p></div>
          </div>
          <Link to="/seller/dashboard/subscription" className="rounded-full bg-nexora-amber px-5 py-2 text-sm font-semibold text-white"><Sparkles size={14} className="inline" /> Upgrade</Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(THEME_PRESETS).map(([key, t]) => {
          const active = current === key;
          return (
            <div key={key} className={`overflow-hidden rounded-2xl border transition-all ${active ? "border-nexora-emerald ring-2 ring-nexora-emerald/30" : "border-nexora-border"}`} data-testid={`theme-${key}`}>
              <div className="relative h-28 p-4" style={{ backgroundColor: t.bg }}>
                <div className="flex gap-1.5">
                  <span className="h-6 w-6 rounded-full" style={{ backgroundColor: t.accent }} />
                  <span className="h-6 w-6 rounded-full bg-white border border-nexora-border" />
                </div>
                <p className={`mt-3 text-lg font-extrabold text-nexora-ink ${t.headingFont}`}>Aa</p>
                <span className="absolute right-3 top-3 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-nexora-ink">{t.tag}</span>
              </div>
              <div className="bg-white p-4">
                <p className="font-bold text-nexora-ink">{t.name}</p>
                <p className="mt-0.5 text-xs text-nexora-muted">{t.tone}</p>
                <button onClick={() => apply(key)} disabled={active || !canSwitch || saving === key}
                  className={`mt-3 w-full rounded-full py-2 text-sm font-semibold ${active ? "bg-nexora-mintbg text-nexora-emeraldDark" : canSwitch ? "bg-nexora-emerald text-white hover:bg-nexora-emeraldDark" : "bg-[#F1F5F3] text-nexora-muted"}`}
                  data-testid={`apply-theme-${key}`}>
                  {active ? <><Check size={14} className="inline" /> Active</> : !canSwitch ? <><Lock size={13} className="inline" /> GROW</> : saving === key ? "Applying…" : "Apply theme"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
