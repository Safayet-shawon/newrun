import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowRight, ArrowLeft, Sparkles, Store, MapPin, Truck } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Logo, Loader } from "@/components/shared/Bits";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const STEPS = ["Business", "Category", "Plan", "Shop", "Delivery"];

export default function Onboarding() {
  const navigate = useNavigate();
  const { refreshMe, setSellerSetup } = useAuth();
  const [step, setStep] = useState(0);
  const [cats, setCats] = useState([]);
  const [plans, setPlans] = useState([]);
  const [features, setFeatures] = useState({});
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    business_name: "", phone: "", category: "", plan: "free", shop_name: "", shop_slug: "", description: "",
    courier_provider: "steadfast", pickup_contact_name: "", pickup_phone: "", pickup_address: "", pickup_area: "", pickup_city: "", pickup_postal_code: "",
  });

  useEffect(() => {
    api.get("/categories").then(({ data }) => setCats(data));
    api.get("/subscriptions/plans").then(({ data }) => { setPlans(data.plans); setFeatures(data.features); });
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const next = () => {
    if (step === 0 && !form.business_name) return toast.error("Enter your business name");
    if (step === 1 && !form.category) return toast.error("Pick a category");
    if (step === 0 && form.phone.replace(/\D/g, "").length < 10) return toast.error("Enter a valid contact phone");
    if (step === 3 && (!form.shop_name || !form.shop_slug)) return toast.error("Enter shop name and URL");
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const finish = async () => {
    if (!form.pickup_contact_name || !form.pickup_phone || !form.pickup_address || !form.pickup_area || !form.pickup_city) {
      return toast.error("Complete the pickup details so the courier knows where to collect parcels");
    }
    if (form.pickup_phone.replace(/\D/g, "").length < 10) return toast.error("Enter a valid pickup phone");
    setSaving(true);
    try {
      await api.post("/seller/onboarding", form);
      await refreshMe();
      setSellerSetup({ onboarding_complete: true });
      toast.success("Shop created! Welcome to NEXORA.");
      navigate("/seller/dashboard");
    } catch (e) { toast.error(formatApiError(e)); } finally { setSaving(false); }
  };

  if (!cats.length || !plans.length) return <div className="min-h-screen bg-nexora-warm"><Loader /></div>;

  return (
    <div className="min-h-screen bg-nexora-warm">
      <div className="border-b border-nexora-border bg-white"><div className="nx-container flex h-16 items-center"><Logo /></div></div>
      <div className="nx-container max-w-3xl py-8">
        {/* stepper */}
        <div className="mb-8 flex items-center justify-between">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center">
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${i <= step ? "bg-nexora-emerald text-white" : "bg-white text-nexora-muted border border-nexora-border"}`}>{i < step ? <Check size={16} /> : i + 1}</div>
              <span className={`ml-2 hidden text-sm font-medium sm:inline ${i <= step ? "text-nexora-ink" : "text-nexora-muted"}`}>{s}</span>
              {i < STEPS.length - 1 && <div className={`mx-3 h-0.5 flex-1 ${i < step ? "bg-nexora-emerald" : "bg-nexora-border"}`} />}
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-nexora-border bg-white p-6 sm:p-8">
          {step === 0 && (
            <div className="space-y-4" data-testid="onboarding-business">
              <h2 className="text-2xl font-extrabold text-nexora-ink">Tell us about your business</h2>
              <input value={form.business_name} onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value, pickup_contact_name: !f.pickup_contact_name || f.pickup_contact_name === f.business_name ? e.target.value : f.pickup_contact_name }))} placeholder="Business / brand name" className="h-12 w-full rounded-xl border border-nexora-border px-4 text-sm outline-none focus:border-nexora-emerald" data-testid="onboarding-business-name" />
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value, pickup_phone: !f.pickup_phone || f.pickup_phone === f.phone ? e.target.value : f.pickup_phone }))} placeholder="Contact phone (+880…)" className="h-12 w-full rounded-xl border border-nexora-border px-4 text-sm outline-none focus:border-nexora-emerald" data-testid="onboarding-phone" />
            </div>
          )}

          {step === 1 && (
            <div data-testid="onboarding-category">
              <h2 className="mb-1 text-2xl font-extrabold text-nexora-ink">Pick your primary category</h2>
              <p className="mb-4 text-sm text-nexora-muted">This determines your storefront's theme family. You can fine-tune it later.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {cats.map((c) => (
                  <button key={c.slug} onClick={() => set("category", c.slug)} data-testid={`onboarding-cat-${c.slug}`}
                    className={`rounded-2xl border p-4 text-left transition-all ${form.category === c.slug ? "border-nexora-emerald bg-nexora-mintbg" : "border-nexora-border hover:border-nexora-emerald"}`}>
                    <Store size={18} className="text-nexora-emerald" />
                    <p className="mt-2 font-semibold text-nexora-ink">{c.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div data-testid="onboarding-plan">
              <h2 className="mb-1 text-2xl font-extrabold text-nexora-ink">Choose your plan</h2>
              <p className="mb-4 text-sm text-nexora-muted">Select the plan that fits your goals. You can change anytime. (Test activation — no payment in this phase.)</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {plans.map((p) => (
                  <button key={p.id} onClick={() => set("plan", p.id)} data-testid={`onboarding-plan-${p.id}`}
                    className={`relative rounded-2xl border p-5 text-left transition-all ${form.plan === p.id ? "border-nexora-emerald ring-2 ring-nexora-emerald/30" : "border-nexora-border hover:border-nexora-emerald"}`}>
                    {p.recommended && <span className="absolute right-3 top-3 rounded-full bg-nexora-emerald px-2 py-0.5 text-[10px] font-bold text-white">POPULAR</span>}
                    <p className="text-sm font-bold text-nexora-muted">{p.name}</p>
                    <p className="mt-1 text-2xl font-extrabold text-nexora-ink">{p.price_bdt ? `৳${p.price_bdt.toLocaleString()}` : "Free"}{p.price_bdt > 0 && <span className="text-sm font-medium text-nexora-muted">/mo</span>}</p>
                    <p className="mt-1 text-xs font-semibold text-nexora-emerald">{p.commission_percent}% marketplace commission</p>
                    <ul className="mt-3 space-y-1.5">
                      {features[p.id]?.slice(0, 4).map((f) => <li key={f} className="flex gap-2 text-xs text-nexora-muted"><Check size={13} className="mt-0.5 shrink-0 text-nexora-emerald" /> {f}</li>)}
                    </ul>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4" data-testid="onboarding-shop">
              <h2 className="text-2xl font-extrabold text-nexora-ink">Set up your shop</h2>
              <input value={form.shop_name} onChange={(e) => { set("shop_name", e.target.value); if (!form.shop_slug) set("shop_slug", slugify(e.target.value)); }} placeholder="Shop name" className="h-12 w-full rounded-xl border border-nexora-border px-4 text-sm outline-none focus:border-nexora-emerald" data-testid="onboarding-shop-name" />
              <div>
                <div className="flex items-center rounded-xl border border-nexora-border px-4">
                  <span className="text-sm text-nexora-muted">nexora.com/shop/</span>
                  <input value={form.shop_slug} onChange={(e) => set("shop_slug", slugify(e.target.value))} placeholder="your-shop" className="h-12 flex-1 bg-transparent text-sm outline-none" data-testid="onboarding-shop-slug" />
                </div>
              </div>
              <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Short description of your shop" className="w-full rounded-xl border border-nexora-border p-4 text-sm outline-none focus:border-nexora-emerald" data-testid="onboarding-shop-desc" />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5" data-testid="onboarding-delivery">
              <div>
                <h2 className="text-2xl font-extrabold text-nexora-ink">Set your parcel pickup point</h2>
                <p className="mt-1 text-sm text-nexora-muted">Set this once. You can change it later from Settings.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[{ id: "steadfast", name: "Steadfast", note: "Recommended" }, { id: "pathao", name: "Pathao", note: "Optional" }].map((courier) => (
                  <button key={courier.id} type="button" onClick={() => set("courier_provider", courier.id)} className={`rounded-2xl border p-4 text-left ${form.courier_provider === courier.id ? "border-nexora-emerald bg-nexora-mintbg ring-2 ring-nexora-emerald/20" : "border-nexora-border"}`}>
                    <Truck size={20} className="text-nexora-emerald" />
                    <span className="mt-2 block font-bold text-nexora-ink">{courier.name}</span>
                    <span className="text-xs text-nexora-muted">{courier.note}</span>
                  </button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <input value={form.pickup_contact_name} onChange={(e) => set("pickup_contact_name", e.target.value)} placeholder="Pickup contact name" className="h-12 rounded-xl border border-nexora-border px-4 text-sm outline-none focus:border-nexora-emerald" />
                <input value={form.pickup_phone} onChange={(e) => set("pickup_phone", e.target.value)} placeholder="Pickup phone (+880…)" className="h-12 rounded-xl border border-nexora-border px-4 text-sm outline-none focus:border-nexora-emerald" />
                <input value={form.pickup_city} onChange={(e) => set("pickup_city", e.target.value)} placeholder="City / district" className="h-12 rounded-xl border border-nexora-border px-4 text-sm outline-none focus:border-nexora-emerald" />
                <input value={form.pickup_area} onChange={(e) => set("pickup_area", e.target.value)} placeholder="Area / thana" className="h-12 rounded-xl border border-nexora-border px-4 text-sm outline-none focus:border-nexora-emerald" />
                <input value={form.pickup_postal_code} onChange={(e) => set("pickup_postal_code", e.target.value)} placeholder="Postal code (optional)" className="h-12 rounded-xl border border-nexora-border px-4 text-sm outline-none focus:border-nexora-emerald" />
              </div>
              <div className="relative">
                <MapPin size={17} className="absolute left-4 top-4 text-nexora-emerald" />
                <textarea value={form.pickup_address} onChange={(e) => set("pickup_address", e.target.value)} rows={3} placeholder="Full pickup address: building, road and nearby landmark" className="w-full rounded-xl border border-nexora-border py-3 pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" />
              </div>
              <p className="rounded-xl bg-nexora-warm p-3 text-xs leading-5 text-nexora-muted">Courier bookings will use this pickup point. Return verification and courier updates may use the registered pickup phone, according to the courier's own process.</p>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="nx-btn-ghost disabled:opacity-0" data-testid="onboarding-back"><ArrowLeft size={15} /> Back</button>
            {step < STEPS.length - 1 ? (
              <button onClick={next} className="nx-btn-primary" data-testid="onboarding-next">Continue <ArrowRight size={15} /></button>
            ) : (
              <button onClick={finish} disabled={saving} className="nx-btn-primary" data-testid="onboarding-finish"><Sparkles size={15} /> {saving ? "Creating…" : "Create my shop"}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
