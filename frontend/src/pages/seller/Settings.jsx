import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import { useSeller } from "@/context/SellerContext";
import { useAuth } from "@/context/AuthContext";
import LockGate from "@/components/seller/LockGate";
import { toast } from "sonner";

const currencies = ["BDT", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "JPY", "INR"];

export default function Settings() {
  const { shop, ent, reload } = useSeller();
  const { user } = useAuth();
  const [form, setForm] = useState(null);
  const [global, setGlobal] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (shop) setForm({ name: shop.name, contact: shop.contact || {} });
  }, [shop]);

  useEffect(() => {
    api.get("/seller/global-settings").then(({ data }) => setGlobal({ ...data, allowed_countries_text: (data.allowed_countries || []).join(", ") })).catch(() => {});
  }, []);

  if (!form || !global) return <Loader />;

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        api.put("/seller/shop", { name: form.name, contact: form.contact }),
        api.put("/seller/global-settings", {
          origin_country: global.origin_country,
          preferred_currency: global.preferred_currency,
          ships_international: global.ships_international,
          allowed_countries: global.allowed_countries_text.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean),
          domestic_fee_bdt: Number(global.domestic_fee_bdt || 0),
          international_fee_bdt: Number(global.international_fee_bdt || 0),
          free_shipping_over_bdt: Number(global.free_shipping_over_bdt || 0),
          processing_days: Number(global.processing_days || 0),
        }),
      ]);
      await reload();
      toast.success("Settings saved");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const updateGlobal = (key, value) => setGlobal((g) => ({ ...g, [key]: value }));
  const input = "h-11 w-full rounded-xl border border-nexora-border px-4 text-sm outline-none focus:border-nexora-emerald";

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-extrabold text-nexora-ink">Settings</h1>

      <div className="space-y-4 rounded-2xl border border-nexora-border bg-white p-6">
        <h3 className="font-bold text-nexora-ink">Shop details</h3>
        <div><label className="mb-1.5 block text-sm font-medium text-nexora-ink">Shop name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={input} data-testid="settings-name" /></div>
        <div><label className="mb-1.5 block text-sm font-medium text-nexora-ink">Shop URL</label><input value={`nexora.com/shop/${shop.slug}`} disabled className="h-11 w-full rounded-xl border border-nexora-border bg-nexora-warm px-4 text-sm text-nexora-muted" /></div>
        <div><label className="mb-1.5 block text-sm font-medium text-nexora-ink">Support phone</label><input value={form.contact?.phone || ""} onChange={(e) => setForm((f) => ({ ...f, contact: { ...f.contact, phone: e.target.value } }))} className={input} data-testid="settings-phone" /></div>
      </div>

      <div className="space-y-4 rounded-2xl border border-nexora-border bg-white p-6">
        <div><h3 className="font-bold text-nexora-ink">Global selling & delivery</h3><p className="mt-1 text-sm text-nexora-muted">Set where your shop ships from and whether international customers can order.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-nexora-ink">Origin country code<input value={global.origin_country} onChange={(e) => updateGlobal("origin_country", e.target.value.toUpperCase().slice(0, 2))} placeholder="BD" className={`mt-1.5 ${input}`} /></label>
          <label className="text-sm font-medium text-nexora-ink">Preferred currency<select value={global.preferred_currency} onChange={(e) => updateGlobal("preferred_currency", e.target.value)} className={`mt-1.5 ${input}`}>{currencies.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="text-sm font-medium text-nexora-ink">Domestic delivery fee (BDT)<input type="number" min="0" value={global.domestic_fee_bdt} onChange={(e) => updateGlobal("domestic_fee_bdt", e.target.value)} className={`mt-1.5 ${input}`} /></label>
          <label className="text-sm font-medium text-nexora-ink">International delivery fee (BDT)<input type="number" min="0" value={global.international_fee_bdt} onChange={(e) => updateGlobal("international_fee_bdt", e.target.value)} className={`mt-1.5 ${input}`} /></label>
          <label className="text-sm font-medium text-nexora-ink">Free delivery over (BDT)<input type="number" min="0" value={global.free_shipping_over_bdt} onChange={(e) => updateGlobal("free_shipping_over_bdt", e.target.value)} className={`mt-1.5 ${input}`} /></label>
          <label className="text-sm font-medium text-nexora-ink">Processing days<input type="number" min="0" max="60" value={global.processing_days} onChange={(e) => updateGlobal("processing_days", e.target.value)} className={`mt-1.5 ${input}`} /></label>
        </div>
        <label className="flex items-center gap-3 rounded-xl border border-nexora-border bg-nexora-warm p-4 text-sm font-semibold text-nexora-ink"><input type="checkbox" checked={global.ships_international} onChange={(e) => updateGlobal("ships_international", e.target.checked)} /> Accept international delivery orders</label>
        {global.ships_international && <label className="block text-sm font-medium text-nexora-ink">Allowed country codes <span className="font-normal text-nexora-muted">(comma-separated, blank = all)</span><input value={global.allowed_countries_text} onChange={(e) => updateGlobal("allowed_countries_text", e.target.value)} placeholder="US, GB, IT, FI, AU" className={`mt-1.5 ${input}`} /></label>}
      </div>

      <button onClick={save} disabled={saving} className="nx-btn-primary" data-testid="save-settings">{saving ? "Saving…" : "Save all settings"}</button>

      <div className="space-y-4 rounded-2xl border border-nexora-border bg-white p-6">
        <h3 className="font-bold text-nexora-ink">Account</h3>
        <p className="text-sm text-nexora-muted">Signed in as <span className="font-medium text-nexora-ink">{user?.email}</span></p>
        <p className="text-sm text-nexora-muted">Email status: <span className={`font-semibold ${user?.email_verified ? "text-emerald-600" : "text-amber-600"}`}>{user?.email_verified ? "Verified" : "Not verified"}</span></p>
      </div>

      <div><h3 className="mb-3 font-bold text-nexora-ink">Staff accounts</h3><LockGate feature="staff_accounts" entitlements={ent} /></div>
      <div><h3 className="mb-3 font-bold text-nexora-ink">Custom CSS &amp; advanced styling</h3><LockGate feature="custom_css" entitlements={ent} /></div>
    </div>
  );
}
