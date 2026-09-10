import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  BadgeCheck,
  CheckCircle2,
  Image,
  Package,
  Search,
  ShieldCheck,
  Store,
  Upload,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Loader } from "@/components/shared/Bits";
import { api, formatApiError, resolveImage } from "@/lib/api";
import { toast } from "sonner";
import { Card, Header, Empty, useGet, inputClass, money, dateText } from "./OwnerShared";

const USER_STATUSES = ["active", "inactive", "suspended", "banned"];
const TRUST = ["none", "verified", "authentic"];
const RISK = ["none", "watch", "red"];
const PRODUCT_AUTH = ["unreviewed", "authentic", "suspicious"];

const selectClass = "rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-teal-500";

function Stat({ icon: Icon, label, value, tone = "teal" }) {
  const tones = {
    teal: "bg-teal-50 text-teal-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    sky: "bg-sky-50 text-sky-700",
  };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${tones[tone] || tones.teal}`}><Icon size={18} /></div><div className="text-2xl font-extrabold text-slate-800">{value ?? 0}</div><p className="mt-0.5 text-xs font-semibold text-slate-500">{label}</p></div>;
}

function RiskPill({ value }) {
  if (value === "red") return <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-extrabold text-rose-700">RED FLAG</span>;
  if (value === "watch") return <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-extrabold text-amber-700">WATCH</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">NORMAL</span>;
}

function TrustPill({ value }) {
  if (value === "authentic") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-extrabold text-emerald-700"><BadgeCheck size={12} /> AUTHENTIC</span>;
  if (value === "verified") return <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1 text-[10px] font-extrabold text-sky-700"><CheckCircle2 size={12} /> VERIFIED</span>;
  return null;
}

async function uploadImage(file, onDone) {
  if (!file) return;
  try {
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
    onDone(data.url);
    toast.success("Image uploaded");
  } catch (e) {
    toast.error(formatApiError(e));
  }
}

function ImageField({ label, value, onChange }) {
  return <label className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{label}<div className="mt-1 flex gap-2"><input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="Image URL" className={`${inputClass} min-w-0 flex-1`} /><label className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl border border-slate-200 bg-white text-teal-700 hover:bg-teal-50" title={`Upload ${label}`}><Upload size={15} /><input type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage(e.target.files?.[0], onChange)} /></label></div></label>;
}

export function OwnerCommandCenter() {
  const [data] = useGet("/admin/control/overview");
  if (!data) return <Loader label="Loading owner command center" />;
  const m = data.metrics || {};
  return <>
    <Header title="Owner Command Center">High-priority control over people, shops, products, trust, risk and platform security.</Header>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
      <Stat icon={Store} label="Sellers" value={m.sellers} />
      <Stat icon={Users} label="Customers" value={m.customers} tone="sky" />
      <Stat icon={Package} label="Published products" value={m.published_products} />
      <Stat icon={AlertTriangle} label="Red flags" value={m.red_flags} tone="rose" />
      <Stat icon={Ban} label="Banned accounts" value={m.banned_accounts} tone="rose" />
      <Stat icon={ShieldCheck} label="Active IP bans" value={m.active_ip_bans} tone="amber" />
    </div>

    <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-extrabold text-slate-800">Priority controls</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link to="/admin/dashboard/people" className="rounded-2xl border border-slate-200 p-4 hover:border-teal-300 hover:bg-teal-50/40"><div className="flex items-center gap-2 font-bold text-slate-800"><Users size={17} className="text-teal-700" /> People & Access</div><p className="mt-1 text-xs leading-5 text-slate-500">Activate, suspend, ban, verify, mark authentic, red-flag and inspect last login IP.</p></Link>
          <Link to="/admin/dashboard/products" className="rounded-2xl border border-slate-200 p-4 hover:border-teal-300 hover:bg-teal-50/40"><div className="flex items-center gap-2 font-bold text-slate-800"><Package size={17} className="text-teal-700" /> Product Moderation</div><p className="mt-1 text-xs leading-5 text-slate-500">Publish/archive, authenticity review, red flags and primary product image control.</p></Link>
          <Link to="/admin/dashboard/categories" className="rounded-2xl border border-slate-200 p-4 hover:border-teal-300 hover:bg-teal-50/40"><div className="flex items-center gap-2 font-bold text-slate-800"><Image size={17} className="text-teal-700" /> Categories & Images</div><p className="mt-1 text-xs leading-5 text-slate-500">Change every category image and hide/show categories without deleting catalogue data.</p></Link>
          <Link to="/admin/dashboard/security" className="rounded-2xl border border-rose-200 p-4 hover:bg-rose-50/50"><div className="flex items-center gap-2 font-bold text-slate-800"><ShieldCheck size={17} className="text-rose-600" /> Security & IP bans</div><p className="mt-1 text-xs leading-5 text-slate-500">Review login history, IP addresses and network-level blocks.</p></Link>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-slate-800">Recent login/security activity</h2><div className="mt-3 divide-y divide-slate-100">{(data.recent_security_events || []).map((e) => <div key={e.id} className="py-3 text-xs"><div className="flex items-center justify-between gap-3"><b className="truncate text-slate-700">{e.email || e.event}</b><span className={e.success ? "text-emerald-600" : "text-rose-600"}>{e.success ? "Success" : "Failed"}</span></div><div className="mt-1 flex justify-between gap-3 text-slate-400"><span>{e.ip || "—"}</span><span>{dateText(e.created_at)}</span></div></div>)}{!(data.recent_security_events || []).length && <Empty />}</div></section>
    </div>
  </>;
}

function PersonRow({ row, reload }) {
  const [form, setForm] = useState({ status: row.status || "active", trust_badge: row.trust_badge || "none", risk_flag: row.risk_flag || "none", moderation_note: row.moderation_note || "", picture: row.picture || "" });
  const [shop, setShop] = useState(row.shop ? { status: row.shop.status || "draft", is_verified: !!row.shop.is_verified, trust_badge: row.shop.trust_badge || "none", risk_flag: row.shop.risk_flag || "none", moderation_note: row.shop.moderation_note || "", logo: row.shop.logo || "", hero_image: row.shop.hero_image || row.shop.banner || "" } : null);
  const saveUser = async () => { try { await api.patch(`/admin/control/users/${row.id}`, form); toast.success("Account controls saved"); reload(); } catch (e) { toast.error(formatApiError(e)); } };
  const saveShop = async () => { if (!shop || !row.shop?.id) return; try { await api.patch(`/admin/control/shops/${row.shop.id}`, shop); toast.success("Shop controls saved"); reload(); } catch (e) { toast.error(formatApiError(e)); } };
  const banIP = async () => { const reason = window.prompt(`Reason for banning ${row.last_login_ip || "this IP"}?`, "Abuse / policy violation"); if (!reason) return; try { await api.post(`/admin/control/users/${row.id}/ban-ip`, { reason }); toast.success("IP banned"); reload(); } catch (e) { toast.error(formatApiError(e)); } };
  return <article className={`rounded-2xl border bg-white p-4 shadow-sm ${row.risk_flag === "red" ? "border-rose-300" : row.risk_flag === "watch" ? "border-amber-300" : "border-slate-200"}`}>
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="truncate text-slate-800">{row.name}</b><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">{row.role}</span><TrustPill value={row.trust_badge} /><RiskPill value={row.risk_flag} /></div><p className="mt-1 text-xs text-slate-500">{row.email}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400"><span>Orders: <b className="text-slate-600">{row.order_count || 0}</b></span>{row.role === "customer" && <span>Spent: <b className="text-slate-600">{money(row.total_spent_bdt)}</b></span>}<span>Last login IP: <b className="font-mono text-slate-600">{row.last_login_ip || "Not recorded yet"}</b></span><span>Logins: <b className="text-slate-600">{row.login_count || 0}</b></span></div></div>
      <div className="flex flex-wrap gap-2"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={selectClass}>{USER_STATUSES.map((x) => <option key={x}>{x}</option>)}</select><select value={form.trust_badge} onChange={(e) => setForm({ ...form, trust_badge: e.target.value })} className={selectClass}>{TRUST.map((x) => <option key={x} value={x}>Trust: {x}</option>)}</select><select value={form.risk_flag} onChange={(e) => setForm({ ...form, risk_flag: e.target.value })} className={selectClass}>{RISK.map((x) => <option key={x} value={x}>Risk: {x}</option>)}</select><button onClick={saveUser} className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white">Save</button>{row.last_login_ip && <button onClick={banIP} className={`rounded-lg border px-3 py-2 text-xs font-bold ${row.ip_banned ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-700"}`}>{row.ip_banned ? "IP banned" : "Ban IP"}</button>}</div>
    </div>
    <textarea value={form.moderation_note} onChange={(e) => setForm({ ...form, moderation_note: e.target.value })} placeholder="Internal moderation note (owner only)" className={`${inputClass} mt-3 h-16 resize-none`} />
    {row.role === "seller" && row.shop && shop && <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-extrabold text-slate-700">Shop controls · {row.shop.name || "Untitled shop"}</summary><div className="mt-4 grid gap-3 lg:grid-cols-2"><div className="space-y-3"><div className="grid grid-cols-2 gap-2"><select value={shop.status} onChange={(e) => setShop({ ...shop, status: e.target.value })} className={selectClass}><option value="draft">draft</option><option value="published">published</option><option value="suspended">suspended</option></select><select value={shop.trust_badge} onChange={(e) => setShop({ ...shop, trust_badge: e.target.value })} className={selectClass}>{TRUST.map((x) => <option key={x} value={x}>Shop trust: {x}</option>)}</select><select value={shop.risk_flag} onChange={(e) => setShop({ ...shop, risk_flag: e.target.value })} className={selectClass}>{RISK.map((x) => <option key={x} value={x}>Shop risk: {x}</option>)}</select><label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"><input type="checkbox" checked={shop.is_verified} onChange={(e) => setShop({ ...shop, is_verified: e.target.checked })} /> Nexora verified</label></div><ImageField label="Shop logo" value={shop.logo} onChange={(v) => setShop({ ...shop, logo: v })} /><ImageField label="Shop cover / hero" value={shop.hero_image} onChange={(v) => setShop({ ...shop, hero_image: v })} /></div><div><textarea value={shop.moderation_note} onChange={(e) => setShop({ ...shop, moderation_note: e.target.value })} placeholder="Shop moderation note" className={`${inputClass} h-24 resize-none`} /><button onClick={saveShop} className="mt-3 w-full rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white">Save shop controls</button></div></div></details>}
  </article>;
}

export function PeopleRiskControl() {
  const [role, setRole] = useState("all");
  const [q, setQ] = useState("");
  const [rows, reload] = useGet(`/admin/control/users?role=${role}`);
  const filtered = useMemo(() => (rows || []).filter((r) => !q.trim() || `${r.name} ${r.email} ${r.last_login_ip || ""} ${r.shop?.name || ""}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  if (!rows) return <Loader label="Loading people & access" />;
  return <><Header title="People & Access">One place for sellers and customers: account status, trust/authentic badge, red flag, shop cover/logo and last login IP.</Header><div className="mb-5 flex flex-wrap gap-2"><div className="relative min-w-[240px] flex-1"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, shop or IP..." className={`${inputClass} pl-9`} /></div><select value={role} onChange={(e) => setRole(e.target.value)} className={selectClass}><option value="all">All people</option><option value="seller">Sellers</option><option value="customer">Customers</option></select></div><div className="space-y-3">{filtered.map((row) => <PersonRow key={row.id} row={row} reload={reload} />)}{!filtered.length && <Empty />}</div></>;
}

function ProductRow({ product, reload }) {
  const [form, setForm] = useState({ status: product.status || "draft", authenticity_status: product.authenticity_status || "unreviewed", risk_flag: product.risk_flag || "none", moderation_note: product.moderation_note || "", primary_image: product.images?.[0] || "" });
  const save = async () => { try { await api.patch(`/admin/control/products/${product.id}`, form); toast.success("Product moderation saved"); reload(); } catch (e) { toast.error(formatApiError(e)); } };
  return <article className={`rounded-2xl border bg-white p-4 ${form.risk_flag === "red" || form.authenticity_status === "suspicious" ? "border-rose-300" : "border-slate-200"}`}><div className="flex gap-4"><div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">{form.primary_image ? <img src={resolveImage(form.primary_image)} alt="" className="h-full w-full object-cover" /> : <Image className="m-6 text-slate-300" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="truncate text-slate-800">{product.title}</b>{form.authenticity_status === "authentic" && <TrustPill value="authentic" />}{form.authenticity_status === "suspicious" && <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-extrabold text-rose-700">SUSPICIOUS / CHECK</span>}<RiskPill value={form.risk_flag} /></div><p className="mt-1 text-xs text-slate-400">{product.shop_name || product.shop_slug || product.shop_id} · {product.category || "uncategorized"} · {money(product.discount_price ?? product.price)}</p><div className="mt-3 flex flex-wrap gap-2"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={selectClass}><option value="draft">draft</option><option value="published">published</option><option value="archived">archived</option></select><select value={form.authenticity_status} onChange={(e) => setForm({ ...form, authenticity_status: e.target.value })} className={selectClass}>{PRODUCT_AUTH.map((x) => <option key={x}>{x}</option>)}</select><select value={form.risk_flag} onChange={(e) => setForm({ ...form, risk_flag: e.target.value })} className={selectClass}>{RISK.map((x) => <option key={x} value={x}>Risk: {x}</option>)}</select><button onClick={save} className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white">Save</button></div></div></div><div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]"><ImageField label="Primary product image" value={form.primary_image} onChange={(v) => setForm({ ...form, primary_image: v })} /><textarea value={form.moderation_note} onChange={(e) => setForm({ ...form, moderation_note: e.target.value })} placeholder="Internal moderation note" className={`${inputClass} h-10 resize-none`} /></div></article>;
}

export function ProductModeration() {
  const [rows, reload] = useGet("/admin/control/products");
  const [q, setQ] = useState("");
  if (!rows) return <Loader label="Loading product moderation" />;
  const filtered = rows.filter((p) => !q.trim() || `${p.title} ${p.brand || ""} ${p.category || ""} ${p.shop_name || ""}`.toLowerCase().includes(q.toLowerCase()));
  return <><Header title="Products & Moderation">Owner override for catalogue visibility, authenticity review, red flags and product cover image.</Header><div className="relative mb-5 max-w-xl"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product, brand, shop or category..." className={`${inputClass} pl-9`} /></div><div className="space-y-3">{filtered.map((p) => <ProductRow key={p.id} product={p} reload={reload} />)}{!filtered.length && <Empty />}</div></>;
}

export function SecurityIPControl() {
  const [data, reload] = useGet("/admin/control/security");
  const [form, setForm] = useState({ ip: "", reason: "", scope: "all" });
  if (!data) return <Loader label="Loading security controls" />;
  const ban = async () => { try { if (!form.ip.trim() || !form.reason.trim()) return toast.error("IP and reason are required"); await api.post("/admin/control/ip-bans", form); setForm({ ip: "", reason: "", scope: "all" }); toast.success("IP ban added"); reload(); } catch (e) { toast.error(formatApiError(e)); } };
  const disable = async (id) => { try { await api.patch(`/admin/control/ip-bans/${id}/disable`); toast.success("IP ban disabled"); reload(); } catch (e) { toast.error(formatApiError(e)); } };
  return <><Header title="Security & IP Bans">Login activity and network-level blocking. Use IP bans carefully: VPNs, offices and mobile networks can share an IP.</Header><section className="rounded-2xl border border-rose-200 bg-white p-5"><h2 className="flex items-center gap-2 font-extrabold text-slate-800"><Ban size={17} className="text-rose-600" /> Add IP ban</h2><div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.5fr_160px_auto]"><input value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="IP address" className={inputClass} /><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason" className={inputClass} /><select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} className={selectClass}><option value="all">All non-admin</option><option value="seller">Sellers only</option><option value="customer">Customers only</option></select><button onClick={ban} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white">Ban IP</button></div></section><div className="mt-6 grid gap-6 xl:grid-cols-[.9fr_1.1fr]"><section className="rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-4 font-extrabold text-slate-800">IP ban list</div><div className="divide-y divide-slate-100">{(data.ip_bans || []).map((b) => <div key={b.id} className="p-4 text-xs"><div className="flex items-center justify-between gap-3"><span className="font-mono font-bold text-slate-700">{b.ip}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${b.active ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"}`}>{b.active ? "ACTIVE" : "DISABLED"}</span></div><p className="mt-1 text-slate-500">{b.reason}</p><div className="mt-2 flex items-center justify-between text-slate-400"><span>{b.scope || "all"} · {dateText(b.created_at)}</span>{b.active && <button onClick={() => disable(b.id)} className="font-bold text-teal-700">Unban</button>}</div></div>)}{!(data.ip_bans || []).length && <Empty>No IP bans.</Empty>}</div></section><section className="rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-4 font-extrabold text-slate-800">Recent authentication activity</div><div className="max-h-[620px] divide-y divide-slate-100 overflow-y-auto">{(data.events || []).map((e) => <div key={e.id} className="p-4 text-xs"><div className="flex items-center justify-between gap-3"><b className="truncate text-slate-700">{e.email || e.event}</b><span className={e.success ? "font-bold text-emerald-600" : "font-bold text-rose-600"}>{e.success ? "SUCCESS" : "FAILED"}</span></div><p className="mt-1 text-slate-500">{e.event} · {e.role || "unknown role"}</p><div className="mt-1 flex flex-wrap justify-between gap-2 text-slate-400"><span className="font-mono">{e.ip || "—"}</span><span>{new Date(e.created_at).toLocaleString()}</span></div>{e.user_agent && <p className="mt-1 truncate text-[10px] text-slate-300" title={e.user_agent}>{e.user_agent}</p>}</div>)}{!(data.events || []).length && <Empty>No login activity recorded yet. New logins will appear here.</Empty>}</div></section></div></>;
}
