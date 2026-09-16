import React, { useEffect, useState } from "react";
import { Check, Sparkles, TicketPercent, X } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import { useSeller } from "@/context/SellerContext";
import { PLAN_META, planRank } from "@/lib/entitlements";
import { toast } from "sonner";

const money = (n) => `৳${Number(n || 0).toLocaleString("en-BD")}`;

export default function Subscription() {
  const { plan, reload } = useSeller();
  const [plans, setPlans] = useState([]);
  const [features, setFeatures] = useState({});
  const [changing, setChanging] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [tokenCode, setTokenCode] = useState("");
  const [quote, setQuote] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    api.get("/seller/subscription-plans").then(({ data }) => {
      setPlans(data.plans);
      setFeatures(data.features);
    }).catch((e) => toast.error(formatApiError(e)));
  }, []);

  if (!plans.length || !plan) return <Loader />;

  const currentRank = planRank(plan.id);
  const selected = plans.find((p) => p.id === selectedPlan);

  const choose = (id) => {
    setSelectedPlan(id);
    setQuote(null);
    setTokenCode("");
  };

  const applyToken = async () => {
    if (!selectedPlan) return toast.error("Choose a plan first");
    if (!tokenCode.trim()) return toast.error("Enter a token code");
    setChecking(true);
    try {
      const { data } = await api.post("/seller/subscription-token/preview", {
        code: tokenCode.trim(),
        plan: selectedPlan,
      });
      setQuote(data);
      toast.success("Token applied");
    } catch (e) {
      setQuote(null);
      toast.error(formatApiError(e));
    } finally {
      setChecking(false);
    }
  };

  const clearToken = () => {
    setTokenCode("");
    setQuote(null);
  };

  const activate = async () => {
    if (!selectedPlan) return;
    setChanging(selectedPlan);
    try {
      let data;
      if (quote) {
        const res = await api.post("/seller/subscription-token/redeem", {
          code: quote.code,
          plan: selectedPlan,
        });
        data = res.data;
        if (data.requires_payment) {
          toast.success(`Token accepted. Pay ${money(data.payable_bdt)} to activate.`);
        } else if (data.token?.token_type === "free_access") {
          toast.success(`${selectedPlan.toUpperCase()} activated free until ${new Date(data.expires_at).toLocaleDateString()}`);
        } else {
          toast.success(`${selectedPlan.toUpperCase()} activated with ${quote.code}`);
        }
      } else {
        const res = await api.post("/seller/subscription", { plan: selectedPlan });
        data = res.data;
        toast.success(`Switched to ${selectedPlan.toUpperCase()} plan`);
      }
      await reload();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setChanging("");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-nexora-ink">Subscription</h1>
        <p className="text-sm text-nexora-muted">
          You're on the <span className="font-bold" style={{ color: PLAN_META[plan.id]?.color }}>{plan.name}</span> plan.
        </p>
      </div>

      <div className="rounded-2xl border border-nexora-emerald/30 bg-nexora-mintbg p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-nexora-muted">Current plan</p>
        <p className="text-2xl font-extrabold text-nexora-ink">{plan.name} · {money(plan.price_bdt)}/mo</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const isCurrent = p.id === plan.id;
          const isSelected = p.id === selectedPlan;
          const rank = planRank(p.id);

          return (
            <div key={p.id} className={`relative flex flex-col rounded-3xl border p-6 ${isSelected ? "border-nexora-emerald ring-2 ring-nexora-emerald/20" : p.recommended ? "border-nexora-emerald/50" : "border-nexora-border"} bg-white`}>
              {p.recommended && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-nexora-emerald px-3 py-1 text-xs font-bold text-white">MOST POPULAR</span>}
              <p className="text-sm font-bold text-nexora-muted">{p.name}</p>
              <p className="mt-1 text-3xl font-extrabold text-nexora-ink">{p.price_bdt ? money(p.price_bdt) : "Free"}{p.price_bdt > 0 && <span className="text-sm font-medium text-nexora-muted">/mo</span>}</p>
              <p className="mt-1 text-xs font-semibold text-nexora-emerald">{p.commission_percent}% marketplace commission</p>
              <p className="mt-1 text-sm text-nexora-muted">{p.tagline}</p>
              <ul className="mt-4 flex-1 space-y-2">
                {features[p.id]?.map((f) => <li key={f} className="flex gap-2 text-sm text-nexora-ink"><Check size={16} className="mt-0.5 shrink-0 text-nexora-emerald" /> {f}</li>)}
              </ul>
              <button
                onClick={() => !isCurrent && choose(p.id)}
                disabled={isCurrent}
                className={`mt-5 w-full rounded-full py-2.5 text-sm font-semibold ${isCurrent ? "bg-nexora-mintbg text-nexora-emeraldDark" : isSelected ? "bg-nexora-emerald text-white" : rank > currentRank ? "bg-nexora-emerald text-white hover:bg-nexora-emeraldDark" : "border border-nexora-border text-nexora-ink"}`}
              >
                {isCurrent ? "Current plan" : isSelected ? "Selected" : rank > currentRank ? <><Sparkles size={14} className="inline" /> Upgrade</> : "Choose plan"}
              </button>
            </div>
          );
        })}
      </div>

      {selected && (
        <section className="rounded-3xl border border-nexora-border bg-white p-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div>
              <h2 className="text-lg font-extrabold text-nexora-ink">Confirm {selected.name}</h2>
              <p className="mt-1 text-sm text-nexora-muted">Regular price: {money(selected.price_bdt)}/month</p>

              <div className="mt-5">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold text-nexora-ink"><TicketPercent size={17} /> Have a subscription token?</p>
                <div className="flex max-w-lg gap-2">
                  <input
                    value={tokenCode}
                    onChange={(e) => { setTokenCode(e.target.value.toUpperCase()); setQuote(null); }}
                    placeholder="Enter token code"
                    className="min-w-0 flex-1 rounded-xl border border-nexora-border px-4 py-3 text-sm uppercase outline-none focus:border-nexora-emerald"
                  />
                  <button onClick={applyToken} disabled={checking} className="rounded-xl bg-nexora-ink px-5 py-3 text-sm font-bold text-white">
                    {checking ? "Checking..." : "Apply"}
                  </button>
                  {quote && <button onClick={clearToken} className="rounded-xl border border-nexora-border px-3"><X size={16}/></button>}
                </div>
              </div>

              {quote && (
                <div className="mt-4 max-w-lg rounded-2xl border border-nexora-emerald/30 bg-nexora-mintbg p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase text-nexora-emeraldDark">{quote.code} applied</p>
                      <p className="mt-1 font-extrabold text-nexora-ink">
                        {quote.token_type === "free_access"
                          ? `${quote.free_access_days} DAYS FREE`
                          : quote.discount_type === "percentage"
                          ? `${quote.discount_value}% OFF`
                          : `${money(quote.discount_value)} OFF`}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-nexora-muted line-through">{money(quote.original_price_bdt)}</p>
                      <p className="text-xl font-extrabold text-nexora-ink">{money(quote.payable_bdt)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-nexora-warm p-5">
              <p className="text-xs font-bold uppercase text-nexora-muted">Summary</p>
              <div className="mt-3 flex justify-between text-sm"><span>{selected.name}</span><b>{money(quote?.original_price_bdt ?? selected.price_bdt)}</b></div>
              {quote && <div className="mt-2 flex justify-between text-sm text-nexora-emeraldDark"><span>Token discount</span><b>-{money(quote.discount_bdt)}</b></div>}
              <div className="my-3 border-t border-nexora-border" />
              <div className="flex justify-between"><b>Payable</b><b className="text-xl">{money(quote?.payable_bdt ?? selected.price_bdt)}</b></div>
              <button onClick={activate} disabled={changing === selectedPlan} className="mt-5 w-full rounded-xl bg-nexora-emerald py-3 text-sm font-bold text-white hover:bg-nexora-emeraldDark">
                {changing === selectedPlan ? "Processing..." : quote?.token_type === "free_access" ? "Activate Free Access" : "Continue"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
