import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import { toast } from "sonner";

const money = (order) => {
  const paisa = order?.total_paisa;
  const value = paisa != null ? Number(paisa) / 100 : Number(order?.total || 0);
  return `৳${value.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
};

const tone = {
  high: "border-red-200 bg-red-50 text-red-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export default function RiskCenter() {
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");

  const load = async (rescan = true) => {
    try {
      const { data } = await api.get(`/seller/risk/orders?limit=150&rescan=${rescan ? "true" : "false"}`);
      setOrders(data);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  useEffect(() => { load(true); }, []);

  const summary = useMemo(() => {
    const rows = orders || [];
    return {
      high: rows.filter((o) => o.risk_band === "high").length,
      medium: rows.filter((o) => o.risk_band === "medium").length,
      duplicates: rows.filter((o) => (o.risk?.duplicate_order_ids || []).length).length,
      hold: rows.filter((o) => o.risk_hold).length,
    };
  }, [orders]);

  const visible = useMemo(() => {
    const rows = orders || [];
    if (filter === "all") return rows;
    if (filter === "duplicate") return rows.filter((o) => (o.risk?.duplicate_order_ids || []).length);
    if (filter === "hold") return rows.filter((o) => o.risk_hold);
    return rows.filter((o) => o.risk_band === filter);
  }, [orders, filter]);

  const review = async (order, action) => {
    setBusy(order.id);
    try {
      const { data } = await api.post(`/seller/risk/orders/${order.id}/review`, { action });
      setOrders((all) => all.map((row) => row.id === order.id ? { ...row, ...data } : row));
      toast.success(action === "approve" ? "Order approved" : action === "dismiss" ? "Risk warning dismissed" : "Order kept flagged");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy("");
    }
  };

  if (!orders) return <Loader label="Scanning recent orders" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><ShieldAlert className="text-nexora-coral" size={24} /><h1 className="text-2xl font-extrabold text-nexora-ink">Fraud & Duplicate Shield</h1></div>
          <p className="mt-1 max-w-3xl text-sm text-nexora-muted">Nexora scores suspicious orders using duplicate patterns, phone history, short-time order velocity, account age and unusual order behaviour. Seller review stays in your control.</p>
        </div>
        <button onClick={() => load(true)} className="nx-btn-ghost"><RefreshCw size={15} /> Rescan</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["High risk", summary.high, "Requires attention"],
          ["Medium risk", summary.medium, "Review when practical"],
          ["Duplicates", summary.duplicates, "Recent matching orders"],
          ["On hold", summary.hold, "Awaiting seller decision"],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border border-nexora-border bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-nexora-muted">{label}</p>
            <p className="mt-1 text-3xl font-extrabold text-nexora-ink">{value}</p>
            <p className="text-xs text-nexora-muted">{note}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {["all", "high", "medium", "low", "duplicate", "hold"].map((value) => (
          <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-4 py-2 text-sm font-bold ${filter === value ? "bg-nexora-ink text-white" : "border border-nexora-border bg-white text-nexora-muted"}`}>
            {value === "all" ? "All scanned" : value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {!visible.length && <div className="rounded-2xl border border-dashed border-nexora-border bg-white p-10 text-center text-sm text-nexora-muted">No orders in this filter.</div>}
        {visible.map((order) => {
          const band = order.risk_band || "low";
          const signals = order.risk?.signals || [];
          const phone = order.delivery_address?.phone || "No phone";
          return (
            <article key={order.id} className="rounded-3xl border border-nexora-border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-extrabold uppercase ${tone[band] || tone.low}`}>{order.risk_score || 0}/100 · {band}</span>
                    {order.risk_hold && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">Review hold</span>}
                    {(order.risk?.duplicate_order_ids || []).length > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Duplicate candidate</span>}
                  </div>
                  <h2 className="mt-3 font-extrabold text-nexora-ink">Order {order.id}</h2>
                  <p className="mt-1 text-sm text-nexora-muted">{order.customer_name || "Customer"} · {phone} · {money(order)} · {order.status}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy === order.id} onClick={() => review(order, "approve")} className="nx-btn-primary"><CheckCircle2 size={15} /> Approve</button>
                  <button disabled={busy === order.id} onClick={() => review(order, "keep_flagged")} className="nx-btn-ghost"><AlertTriangle size={15} /> Keep flagged</button>
                  <button disabled={busy === order.id} onClick={() => review(order, "dismiss")} className="nx-btn-ghost"><ShieldCheck size={15} /> Dismiss</button>
                </div>
              </div>

              {signals.length > 0 ? (
                <div className="mt-4 grid gap-2 lg:grid-cols-2">
                  {signals.map((signal, index) => (
                    <div key={`${signal.code}-${index}`} className="rounded-2xl bg-nexora-warm p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="text-sm font-bold text-nexora-ink">{signal.title}</p><p className="mt-1 text-xs leading-5 text-nexora-muted">{signal.detail}</p></div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-extrabold ${signal.points < 0 ? "bg-emerald-100 text-emerald-700" : "bg-white text-nexora-coral"}`}>{signal.points > 0 ? "+" : ""}{signal.points}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-4 text-sm text-nexora-muted">No suspicious signals detected.</p>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
