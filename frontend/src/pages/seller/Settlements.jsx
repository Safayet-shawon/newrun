import React, { useEffect, useState } from "react";
import { RefreshCw, WalletCards } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Loader, EmptyState } from "@/components/shared/Bits";
import { toast } from "sonner";

const money = (paisa) => `৳${(Number(paisa || 0) / 100).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

export default function Settlements() {
  const [data, setData] = useState(null);
  const load = async () => {
    try { const { data: result } = await api.get("/seller/settlements"); setData(result); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);
  if (!data) return <Loader label="Loading settlements" />;
  const s = data.summary || {};
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[.2em] text-nexora-emerald">Money movement</p><h1 className="mt-1 text-2xl font-extrabold text-nexora-ink">Seller settlements</h1><p className="mt-1 text-sm text-nexora-muted">Auditable view of delivered-order payables. COD and platform-held payments are kept separate so Nexora never pretends money moved when it did not.</p></div><button onClick={load} className="nx-btn-ghost"><RefreshCw size={15}/> Refresh</button></div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Ready for payout" value={money(s.ready_paisa)}/><Metric label="Paid" value={money(s.paid_paisa)}/><Metric label="External COD pending" value={money(s.cod_external_pending_paisa)}/></div>
    {(data.items || []).length === 0 ? <EmptyState icon={WalletCards} title="No settlements yet" description="Delivered orders will create settlement ledger entries here."/> : <div className="overflow-hidden rounded-2xl border border-nexora-border bg-white"><table className="w-full text-sm"><thead className="border-b border-nexora-border bg-nexora-warm text-left text-xs uppercase tracking-wide text-nexora-muted"><tr><th className="p-3">Order</th><th className="p-3">Type</th><th className="p-3">Seller net</th><th className="p-3">Commission</th><th className="p-3">Status</th><th className="hidden p-3 md:table-cell">Reference</th></tr></thead><tbody className="divide-y divide-nexora-border">{data.items.map((row)=><tr key={row.id}><td className="p-3 font-bold text-nexora-ink">#{String(row.order_id).slice(-6).toUpperCase()}</td><td className="p-3">{String(row.kind || "").replaceAll("_"," ")}</td><td className="p-3 font-bold">{money(row.seller_net_paisa)}</td><td className="p-3">{money(row.platform_commission_paisa)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase ${row.status === "paid" ? "bg-emerald-100 text-emerald-700" : row.status === "ready" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}`}>{String(row.status || "pending").replaceAll("_"," ")}</span></td><td className="hidden p-3 text-xs text-nexora-muted md:table-cell">{row.payout_reference || "—"}</td></tr>)}</tbody></table></div>}
  </div>;
}

function Metric({ label, value }) { return <div className="rounded-2xl border border-nexora-border bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-nexora-muted">{label}</p><p className="mt-1 text-2xl font-extrabold text-nexora-ink">{value}</p></div>; }
