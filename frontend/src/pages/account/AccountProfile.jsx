import React, { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function AccountProfile() {
  const { user, refreshMe } = useAuth();
  const [form, setForm] = useState({ name: user?.name || "", phone: user?.phone || "" });
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.put("/account/profile", form); await refreshMe(); toast.success("Profile updated"); }
    catch { toast.error("Could not update"); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-lg">
      <h2 className="mb-5 text-xl font-bold text-nexora-ink">Profile settings</h2>
      <form onSubmit={save} className="space-y-4 rounded-2xl border border-nexora-border bg-white p-5" data-testid="profile-form">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-nexora-ink">Full name</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-11 w-full rounded-xl border border-nexora-border px-4 text-sm outline-none focus:border-nexora-emerald" data-testid="profile-name" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-nexora-ink">Email</label>
          <input value={user?.email} disabled className="h-11 w-full rounded-xl border border-nexora-border bg-nexora-warm px-4 text-sm text-nexora-muted" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-nexora-ink">Phone</label>
          <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+880 …" className="h-11 w-full rounded-xl border border-nexora-border px-4 text-sm outline-none focus:border-nexora-emerald" data-testid="profile-phone" />
        </div>
        <button disabled={saving} className="nx-btn-primary" data-testid="save-profile">{saving ? "Saving…" : "Save changes"}</button>
      </form>
    </div>
  );
}
