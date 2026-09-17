import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Loader, EmptyState, Badge } from "@/components/shared/Bits";
import { formatBDT, timeAgo } from "@/lib/format";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";

const ACTIONS = { pending: ["confirm", "Confirm order"], confirmed: ["packed", "Mark packed"], processing: ["packed", "Mark packed"], packed: ["ready_for_pickup", "Ready for pickup"] };

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState("");
  useEffect(() => { api.get("/seller/orders").then(({ data }) => setOrders(data)); }, []);
  if (!orders) return <Loader />;

  const act = async (order, action) => {
    setBusy(order.id);
    try {
      const { data } = await api.post(`/seller/orders/${order.id}/action`, { action });
      setOrders((all) => all.map((item) => item.id === order.id ? { ...item, ...data } : item));
      toast.success(action === "ready_for_pickup" ? "Parcel is ready. Courier connection is pending configuration." : "Order updated");
    } catch (error) { toast.error(formatApiError(error)); } finally { setBusy(""); }
  };

  const returnAct = async (order, action) => {
    setBusy(order.id);
    try {
      const { data } = await api.post(`/seller/orders/${order.id}/return-action`, { action });
      setOrders((all) => all.map((item) => item.id === order.id ? { ...item, return_request: data, return_status: data.status } : item));
      toast.success("Return workflow updated");
    } catch (error) { toast.error(formatApiError(error)); } finally { setBusy(""); }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-nexora-ink">Orders</h1>
      {orders.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No orders yet" description="Orders from customers will appear here once your store goes live." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-nexora-border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-nexora-border bg-nexora-warm text-left text-xs font-semibold uppercase tracking-wide text-nexora-muted">
              <tr><th className="p-3">Order</th><th className="p-3">Customer</th><th className="hidden p-3 sm:table-cell">Items</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3">Next step</th><th className="hidden p-3 md:table-cell">Placed</th></tr>
            </thead>
            <tbody className="divide-y divide-nexora-border">
              {orders.map((o) => (
                <tr key={o.id} data-testid={`seller-order-${o.id}`}>
                  <td className="p-3 font-semibold text-nexora-ink">#{o.id.slice(-6).toUpperCase()}</td>
                  <td className="p-3">{o.customer_name}</td>
                  <td className="hidden p-3 sm:table-cell">{o.items?.length}</td>
                  <td className="p-3 font-bold">{formatBDT(o.total)}</td>
                  <td className="p-3"><Badge tone="emerald">{o.status}</Badge>{o.return_request && <span className="mt-1 block text-[10px] font-semibold text-amber-700">Return: {o.return_request.status.replaceAll("_", " ")}</span>}</td>
                  <td className="p-3">
                    {o.return_request?.status === "requested" ? <span className="flex gap-1"><button disabled={busy === o.id} onClick={() => returnAct(o, "approve")} className="rounded-lg bg-nexora-emerald px-2 py-2 text-xs font-bold text-white">Approve return</button><button disabled={busy === o.id} onClick={() => returnAct(o, "reject")} className="rounded-lg border px-2 py-2 text-xs font-bold">Reject</button></span> : o.return_request?.status === "approved" ? <button disabled={busy === o.id} onClick={() => returnAct(o, "item_received")} className="rounded-lg bg-nexora-emerald px-2 py-2 text-xs font-bold text-white">Item received</button> : o.return_request?.status === "item_received" ? <button disabled={busy === o.id} onClick={() => returnAct(o, "refund_pending")} className="rounded-lg bg-amber-600 px-2 py-2 text-xs font-bold text-white">Send to refund review</button> : ACTIONS[o.status] ? <button disabled={busy === o.id} onClick={() => act(o, ACTIONS[o.status][0])} className="rounded-lg bg-nexora-emerald px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy === o.id ? "Saving…" : ACTIONS[o.status][1]}</button> : o.shipment_id ? <span className="text-xs text-nexora-muted">{o.courier_status?.replaceAll("_", " ")}</span> : <span className="text-xs text-nexora-muted">No action</span>}
                  </td>
                  <td className="hidden p-3 text-nexora-muted md:table-cell">{timeAgo(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
