import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Loader, EmptyState, Badge } from "@/components/shared/Bits";
import { formatBDT, timeAgo } from "@/lib/format";
import { AlertTriangle, Link2, RefreshCw, ShieldAlert, ShoppingCart, Truck } from "lucide-react";
import { toast } from "sonner";

const ACTIONS = { pending: ["confirm", "Confirm order"], confirmed: ["packed", "Mark packed"], processing: ["packed", "Mark packed"], packed: ["ready_for_pickup", "Ready for pickup"] };
const riskTone = { high: "bg-red-100 text-red-700", medium: "bg-amber-100 text-amber-800", low: "bg-emerald-100 text-emerald-700" };
const TRACKING = new Set(["pickup_requested", "picked_up", "in_transit", "delivered", "returned", "failed"]);

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const [riskResult, orderResult] = await Promise.all([
        api.get("/seller/risk/orders?limit=200&rescan=true"),
        api.get("/seller/orders"),
      ]);
      const operational = new Map((orderResult.data || []).map((row) => [row.id, row]));
      setOrders((riskResult.data || []).map((row) => ({ ...operational.get(row.id), ...row, return_request: operational.get(row.id)?.return_request })));
    } catch {
      const { data } = await api.get("/seller/orders");
      setOrders(data);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!orders) return <Loader />;

  const act = async (order, action) => {
    if (action === "confirm" && order.risk_hold) {
      toast.error("Review this high-risk or duplicate order in Fraud Shield before confirming it.");
      return;
    }
    setBusy(order.id);
    try {
      await api.post(`/seller/orders/${order.id}/action`, { action });
      toast.success(action === "ready_for_pickup" ? "Parcel marked ready. You can now book the best connected courier." : "Order updated");
      await load();
    } catch (error) {
      toast.error(formatApiError(error));
      await load();
    } finally { setBusy(""); }
  };

  const returnAct = async (order, action) => {
    setBusy(order.id);
    try { await api.post(`/seller/orders/${order.id}/return-action`, { action }); toast.success("Return workflow updated"); await load(); }
    catch (error) { toast.error(formatApiError(error)); }
    finally { setBusy(""); }
  };

  const verifyDecision = async (order, action = "approve") => {
    setBusy(order.id);
    try { await api.post(`/seller/growth/orders/${order.id}/verification`, { action, note: action === "approve" ? "Seller reviewed and approved" : "" }); toast.success("Fraud decision resolved"); await load(); }
    catch (error) { toast.error(formatApiError(error)); }
    finally { setBusy(""); }
  };

  const verificationLink = async (order) => {
    setBusy(order.id);
    try {
      const { data } = await api.post(`/seller/growth/orders/${order.id}/verification-link`, { expires_hours: 24 });
      try { await navigator.clipboard.writeText(data.url); toast.success("Customer verification link copied"); }
      catch { toast.success(`Verification link created: ${data.url}`); }
    } catch (error) { toast.error(formatApiError(error)); }
    finally { setBusy(""); }
  };

  const bookCourier = async (order) => {
    setBusy(order.id);
    try {
      const { data } = await api.post(`/seller/integrations/couriers/book/${order.id}`, { auto_fallback: true });
      toast.success(`${String(data.provider || "Courier").toUpperCase()} booked · ${data.tracking_code}`);
      await load();
    } catch (error) { toast.error(formatApiError(error)); }
    finally { setBusy(""); }
  };

  const trackCourier = async (order) => {
    setBusy(order.id);
    try { const { data } = await api.post(`/seller/integrations/couriers/track/${order.id}`); toast.success(`Courier status: ${String(data.status).replaceAll("_", " ")}`); await load(); }
    catch (error) { toast.error(formatApiError(error)); }
    finally { setBusy(""); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold text-nexora-ink">Orders</h1><p className="mt-1 text-sm text-nexora-muted">Fraud decisions, customer verification, courier booking and tracking happen from the same workflow.</p></div>
        <div className="flex gap-2"><button onClick={load} className="nx-btn-ghost"><RefreshCw size={15}/> Refresh</button><Link to="/seller/dashboard/couriers" className="nx-btn-ghost"><Truck size={15}/> Couriers</Link><Link to="/seller/dashboard/risk-center" className="nx-btn-ghost"><ShieldAlert size={15}/> Fraud Shield</Link></div>
      </div>
      {orders.length === 0 ? <EmptyState icon={ShoppingCart} title="No orders yet" description="Orders from customers will appear here once your store goes live." /> : (
        <div className="overflow-x-auto rounded-2xl border border-nexora-border bg-white"><table className="w-full min-w-[1050px] text-sm">
          <thead className="border-b border-nexora-border bg-nexora-warm text-left text-xs font-semibold uppercase tracking-wide text-nexora-muted"><tr><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Items</th><th className="p-3">Total</th><th className="p-3">Risk</th><th className="p-3">Courier</th><th className="p-3">Status</th><th className="p-3">Next step</th><th className="p-3">Placed</th></tr></thead>
          <tbody className="divide-y divide-nexora-border">{orders.map((o) => <tr key={o.id} className={(o.risk_hold || o.operational_hold) ? "bg-red-50/40" : ""}>
            <td className="p-3 font-semibold text-nexora-ink">#{o.id.slice(-6).toUpperCase()}</td><td className="p-3">{o.customer_name}</td><td className="p-3">{o.items?.length}</td><td className="p-3 font-bold">{formatBDT(o.total)}</td>
            <td className="p-3">{o.risk_band ? <div><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold uppercase ${riskTone[o.risk_band] || riskTone.low}`}>{o.risk_score || 0}/100 {o.risk_band}</span>{(o.risk?.duplicate_order_ids || []).length > 0 && <span className="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-700"><AlertTriangle size={11}/> Duplicate</span>}{o.operational_hold && <span className="mt-1 block text-[10px] font-bold text-red-700">Decision: {String(o.fraud_decision?.action || "review").replaceAll("_"," ")}</span>}</div> : <span className="text-xs text-nexora-muted">Not scanned</span>}</td>
            <td className="p-3"><p className="font-bold capitalize text-nexora-ink">{o.selected_courier || "—"}</p>{o.courier_status && <p className="mt-1 text-[10px] text-nexora-muted">{String(o.courier_status).replaceAll("_"," ")}</p>}</td>
            <td className="p-3"><Badge tone="emerald">{o.status}</Badge>{o.return_request && <span className="mt-1 block text-[10px] font-semibold text-amber-700">Return: {o.return_request.status.replaceAll("_", " ")}</span>}</td>
            <td className="p-3"><NextStep order={o} busy={busy === o.id} act={act} returnAct={returnAct} verifyDecision={verifyDecision} verificationLink={verificationLink} bookCourier={bookCourier} trackCourier={trackCourier}/></td>
            <td className="p-3 text-nexora-muted">{timeAgo(o.created_at)}</td>
          </tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

function NextStep({ order:o, busy, act, returnAct, verifyDecision, verificationLink, bookCourier, trackCourier }) {
  if (o.risk_hold && o.status === "pending") return <Link to="/seller/dashboard/risk-center" className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white"><ShieldAlert size={13}/> Review risk</Link>;
  if (o.operational_hold) return <div className="flex flex-wrap gap-1"><button disabled={busy} onClick={()=>verifyDecision(o,"approve")} className="rounded-lg bg-nexora-emerald px-2 py-2 text-xs font-bold text-white">Seller approve</button><button disabled={busy} onClick={()=>verificationLink(o)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-2 text-xs font-bold"><Link2 size={12}/> Customer verify</button></div>;
  if (o.return_request?.status === "requested") return <span className="flex gap-1"><button disabled={busy} onClick={()=>returnAct(o,"approve")} className="rounded-lg bg-nexora-emerald px-2 py-2 text-xs font-bold text-white">Approve return</button><button disabled={busy} onClick={()=>returnAct(o,"reject")} className="rounded-lg border px-2 py-2 text-xs font-bold">Reject</button></span>;
  if (o.return_request?.status === "approved") return <button disabled={busy} onClick={()=>returnAct(o,"item_received")} className="rounded-lg bg-nexora-emerald px-2 py-2 text-xs font-bold text-white">Item received</button>;
  if (o.return_request?.status === "item_received") return <button disabled={busy} onClick={()=>returnAct(o,"refund_pending")} className="rounded-lg bg-amber-600 px-2 py-2 text-xs font-bold text-white">Refund review</button>;
  if (o.status === "ready_for_pickup" && (!o.courier_status || o.courier_status === "awaiting_courier_connection")) return <button disabled={busy} onClick={()=>bookCourier(o)} className="inline-flex items-center gap-1 rounded-lg bg-nexora-emerald px-3 py-2 text-xs font-bold text-white"><Truck size={13}/> Book best courier</button>;
  if (TRACKING.has(o.courier_status) && o.courier_status !== "delivered") return <button disabled={busy} onClick={()=>trackCourier(o)} className="inline-flex items-center gap-1 rounded-lg border border-nexora-border px-3 py-2 text-xs font-bold"><RefreshCw size={13}/> Refresh tracking</button>;
  if (ACTIONS[o.status]) return <button disabled={busy} onClick={()=>act(o,ACTIONS[o.status][0])} className="rounded-lg bg-nexora-emerald px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? "Saving…" : ACTIONS[o.status][1]}</button>;
  if (o.courier_status) return <span className="text-xs text-nexora-muted">{String(o.courier_status).replaceAll("_"," ")}</span>;
  return <span className="text-xs text-nexora-muted">No action</span>;
}
