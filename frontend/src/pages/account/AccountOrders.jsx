import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Package } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, Loader } from "@/components/shared/Bits";
import { formatBDT, timeAgo } from "@/lib/format";

export default function AccountOrders() {
  const [orders, setOrders] = useState(null);
  useEffect(() => { api.get("/account/orders").then(({ data }) => setOrders(data)).catch(() => setOrders([])); }, []);
  if (!orders) return <Loader />;
  if (orders.length === 0) return <EmptyState icon={Package} title="No orders yet" description="When you place an order it will appear here." action={<Link to="/products" className="nx-btn-primary mt-2">Shop now</Link>} />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-nexora-ink">My orders</h2>
      {orders.map((o) => (
        <div key={o.id} className="rounded-2xl border border-nexora-border bg-white p-5" data-testid={`order-${o.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-nexora-border pb-3">
            <div><p className="font-bold text-nexora-ink">Order #{o.id.slice(-6).toUpperCase()}</p><p className="text-xs text-nexora-muted">{o.shop_name} · {timeAgo(o.created_at)}</p></div>
            <span className="rounded-full bg-nexora-mintbg px-3 py-1 text-xs font-semibold text-nexora-emeraldDark capitalize">{o.status}</span>
          </div>
          <div className="mt-3 space-y-2">
            {o.items?.map((it, i) => (
              <div key={i} className="flex justify-between text-sm"><span className="text-nexora-ink">{it.qty}× {it.title}</span><span className="font-medium">{formatBDT(it.price * it.qty)}</span></div>
            ))}
          </div>
          <div className="mt-3 flex justify-between border-t border-nexora-border pt-3"><span className="font-semibold">Total</span><span className="font-extrabold text-nexora-emerald">{formatBDT(o.total)}</span></div>
        </div>
      ))}
    </div>
  );
}
