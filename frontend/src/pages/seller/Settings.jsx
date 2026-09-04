import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import { useSeller } from "@/context/SellerContext";
import { useAuth } from "@/context/AuthContext";
import LockGate from "@/components/seller/LockGate";
import { toast } from "sonner";

export default function Settings() {
  const { shop, ent, reload } = useSeller();
  const { user } = useAuth();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (shop) setForm({ name: shop.name, contact: shop.contact || {} }); }, [shop]);
  if (!form) return <Loader />;

  const save = async () => {
    setSaving(true);
    try { await api.put("/seller/shop", { name: form.name, contact: form.contact }); await reload(); toast.success("Settings saved"); }
    catch (e) { toast.error(formatApiError(e)); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-extrabold text-nexora-ink">Settings</h1>

      <div className="space-y-4 rounded-2xl border border-nexora-border bg-white p-6">
        <h3 className="font-bold text-nexora-ink">Shop details</h3>
        <div><label className="mb-1.5 block text-sm font-medium text-nexora-ink">Shop name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-11 w-full rounded-xl border border-nexora-border px-4 text-sm outline-none focus:border-nexora-emerald" data-testid="settings-name" /></div>
        <div><label className="mb-1.5 block text-sm font-medium text-nexora-ink">Shop URL</label><input value={`nexora.com/shop/${shop.slug}`} disabled className="h-11 w-full rounded-xl border border-nexora-border bg-nexora-warm px-4 text-sm text-nexora-muted" /></div>
        <div><label className="mb-1.5 block text-sm font-medium text-nexora-ink">Support phone</label><input value={form.contact?.phone || ""} onChange={(e) => setForm((f) => ({ ...f, contact: { ...f.contact, phone: e.target.value } }))} className="h-11 w-full rounded-xl border border-nexora-border px-4 text-sm outline-none focus:border-nexora-emerald" data-testid="settings-phone" /></div>
        <button onClick={save} disabled={saving} className="nx-btn-primary" data-testid="save-settings">{saving ? "Saving…" : "Save settings"}</button>
      </div>

      <div className="space-y-4 rounded-2xl border border-nexora-border bg-white p-6">
        <h3 className="font-bold text-nexora-ink">Account</h3>
        <p className="text-sm text-nexora-muted">Signed in as <span className="font-medium text-nexora-ink">{user?.email}</span></p>
      </div>

      <div>
        <h3 className="mb-3 font-bold text-nexora-ink">Staff accounts</h3>
        <LockGate feature="staff_accounts" entitlements={ent} />
      </div>

      <div>
        <h3 className="mb-3 font-bold text-nexora-ink">Custom CSS &amp; advanced styling</h3>
        <LockGate feature="custom_css" entitlements={ent} />
      </div>
    </div>
  );
}
