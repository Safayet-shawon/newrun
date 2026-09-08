import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Power, PowerOff, Pencil, X, History } from "lucide-react";

const blank = {
  code: "",
  token_type: "discount",
  applicable_plans: ["start", "grow", "pro"],
  discount_type: "percentage",
  discount_value: 20,
  free_access_days: 30,
  max_uses: "",
  per_seller_limit: 1,
  redeem_within_days: "",
  is_active: true,
};

const input = "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500";

export default function AdminTokens() {
  const [tokens, setTokens] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [history, setHistory] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/admin/nexora/tokens").then((r) => setTokens(r.data)).catch((e) => toast.error(formatApiError(e)));
  useEffect(() => { load(); }, []);

  const togglePlan = (p) => setForm((f) => ({ ...f, applicable_plans: f.applicable_plans.includes(p) ? f.applicable_plans.filter((x) => x !== p) : [...f.applicable_plans, p] }));

  const payload = () => ({
    ...form,
    code: form.code.trim().toUpperCase(),
    discount_type: form.token_type === "discount" ? form.discount_type : null,
    discount_value: form.token_type === "discount" ? Number(form.discount_value) : null,
    free_access_days: form.token_type === "free_access" ? Number(form.free_access_days) : null,
    max_uses: form.max_uses === "" ? null : Number(form.max_uses),
    per_seller_limit: form.per_seller_limit === "" ? null : Number(form.per_seller_limit),
    redeem_within_days: form.redeem_within_days === "" ? null : Number(form.redeem_within_days),
  });

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) await api.put(`/admin/nexora/tokens/${editing}`, payload());
      else await api.post("/admin/nexora/tokens", payload());
      toast.success(editing ? "Token updated" : "Token created");
      setEditing(null); setForm(blank); load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const edit = (t) => {
    setEditing(t.id);
    setForm({
      code: t.code,
      token_type: t.token_type,
      applicable_plans: t.applicable_plans || [],
      discount_type: t.discount_type || "percentage",
      discount_value: t.discount_value ?? 20,
      free_access_days: t.free_access_days ?? 30,
      max_uses: t.max_uses ?? "",
      per_seller_limit: t.per_seller_limit ?? "",
      redeem_within_days: t.redeem_within_days ?? "",
      is_active: t.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggle = async (t) => {
    try { await api.patch(`/admin/nexora/tokens/${t.id}/status`, { is_active: !t.is_active }); toast.success(t.is_active ? "Token disabled" : "Token enabled"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const showHistory = async (t) => {
    try {
      const { data } = await api.get(`/admin/nexora/tokens/${t.id}/redemptions`);
      setHistory({ token: t, rows: data });
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-7">
      <div><h1 className="text-2xl font-extrabold text-slate-800">Subscription Tokens</h1><p className="mt-1 text-sm text-slate-500">Create discount or free-access tokens and control their lifetime and usage.</p></div>

      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-center justify-between"><h2 className="font-bold text-slate-800">{editing ? "Edit Token" : "Create Token"}</h2>{editing && <button type="button" onClick={() => { setEditing(null); setForm(blank); }} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500"><X size={14}/> Cancel edit</button>}</div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs font-bold text-slate-500">TOKEN CODE<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="NEXORA50" required className={`mt-1 ${input}`} /></label>
          <label className="text-xs font-bold text-slate-500">TOKEN TYPE<select value={form.token_type} onChange={(e) => setForm({ ...form, token_type: e.target.value })} className={`mt-1 ${input}`}><option value="discount">Discount</option><option value="free_access">Free Access</option></select></label>

          {form.token_type === "discount" ? <>
            <label className="text-xs font-bold text-slate-500">DISCOUNT TYPE<select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })} className={`mt-1 ${input}`}><option value="percentage">Percentage %</option><option value="fixed">Fixed ৳</option></select></label>
            <label className="text-xs font-bold text-slate-500">DISCOUNT VALUE<input type="number" min="0" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} className={`mt-1 ${input}`} /></label>
          </> : <label className="text-xs font-bold text-slate-500">FREE ACCESS DAYS<input type="number" min="1" value={form.free_access_days} onChange={(e) => setForm({ ...form, free_access_days: e.target.value })} className={`mt-1 ${input}`} /></label>}

          <label className="text-xs font-bold text-slate-500">MAXIMUM USES<input type="number" min="1" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} placeholder="Blank = Unlimited" className={`mt-1 ${input}`} /></label>
          <label className="text-xs font-bold text-slate-500">PER SELLER LIMIT<input type="number" min="1" value={form.per_seller_limit} onChange={(e) => setForm({ ...form, per_seller_limit: e.target.value })} placeholder="Blank = Unlimited" className={`mt-1 ${input}`} /></label>
          <label className="text-xs font-bold text-slate-500">USE WITHIN DAYS<input type="number" min="1" value={form.redeem_within_days} onChange={(e) => setForm({ ...form, redeem_within_days: e.target.value })} placeholder="Blank = No expiry" className={`mt-1 ${input}`} /></label>
        </div>

        <div className="mt-5"><p className="mb-2 text-xs font-bold text-slate-500">APPLICABLE PLANS</p><div className="flex gap-2">{["start","grow","pro"].map((p) => <button type="button" key={p} onClick={() => togglePlan(p)} className={`rounded-full px-4 py-2 text-xs font-bold ${form.applicable_plans.includes(p) ? "bg-teal-600 text-white" : "border border-slate-200 text-slate-500"}`}>{p.toUpperCase()}</button>)}</div></div>

        <button disabled={saving} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white"><Plus size={16}/>{saving ? "Saving..." : editing ? "Save Token" : "Create Token"}</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="p-4">Token</th><th>Type</th><th>Benefit</th><th>Plans</th><th>Used</th><th>Redeem Before</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {tokens.map((t) => <tr key={t.id} className="border-t border-slate-100">
              <td className="p-4 font-bold text-slate-800">{t.code}</td>
              <td>{t.token_type === "free_access" ? "Free Access" : "Discount"}</td>
              <td>{t.token_type === "free_access" ? `${t.free_access_days} days FREE` : t.discount_type === "percentage" ? `${t.discount_value}% OFF` : `৳${t.discount_value} OFF`}</td>
              <td className="uppercase">{(t.applicable_plans || []).join(", ")}</td>
              <td>{t.used_count || 0} / {t.max_uses ?? "∞"}</td>
              <td>{t.redeem_before ? new Date(t.redeem_before).toLocaleDateString() : "No expiry"}</td>
              <td><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${t.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{t.is_active ? "Active" : "Disabled"}</span></td>
              <td><div className="flex gap-1"><button title="Edit" onClick={() => edit(t)} className="rounded-lg border p-2 text-teal-700"><Pencil size={14}/></button><button title="History" onClick={() => showHistory(t)} className="rounded-lg border p-2 text-slate-600"><History size={14}/></button><button title={t.is_active ? "Disable" : "Enable"} onClick={() => toggle(t)} className="rounded-lg border p-2">{t.is_active ? <PowerOff size={14} className="text-rose-600"/> : <Power size={14} className="text-emerald-700"/>}</button></div></td>
            </tr>)}
          </tbody>
        </table>
      </div>

      {history && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Usage History · {history.token.code}</h2><p className="text-sm text-slate-400">{history.rows.length} redemption(s)</p></div><button onClick={() => setHistory(null)} className="rounded-lg border p-2"><X size={16}/></button></div><div className="mt-4 divide-y">{history.rows.map((r) => <div key={r.id} className="grid gap-1 py-3 text-sm sm:grid-cols-4"><span className="font-semibold">{r.plan?.toUpperCase()}</span><span>{r.token_type}</span><span>Discount {`৳${Number(r.discount_bdt || 0).toLocaleString()}`}</span><span>{new Date(r.redeemed_at).toLocaleString()}</span><small className="sm:col-span-4 text-slate-400">Seller: {r.seller_id} · Shop: {r.shop_id || "—"}</small></div>)}{!history.rows.length && <p className="py-8 text-center text-sm text-slate-400">Not used yet.</p>}</div></div></div>}
    </div>
  );
}
