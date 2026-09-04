import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Package, Heart, MapPin, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { formatBDT } from "@/lib/format";

export default function AccountOverview() {
  const { wishlist } = useStore();
  const [orders, setOrders] = useState([]);
  useEffect(() => { api.get("/account/orders").then(({ data }) => setOrders(data)).catch(() => {}); }, []);
  const spent = orders.reduce((n, o) => n + (o.total || 0), 0);

  const stats = [
    { icon: Package, label: "Total orders", value: orders.length, to: "/account/orders" },
    { icon: Heart, label: "Wishlist items", value: wishlist.length, to: "/account/wishlist" },
    { icon: MapPin, label: "Total spent", value: formatBDT(spent), to: "/account/orders" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="rounded-2xl border border-nexora-border bg-white p-5 transition-shadow hover:shadow-md" data-testid={`account-stat-${s.label}`}>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-nexora-mintbg text-nexora-emerald"><s.icon size={18} /></div>
            <p className="mt-3 text-2xl font-extrabold text-nexora-ink">{s.value}</p>
            <p className="text-sm text-nexora-muted">{s.label}</p>
          </Link>
        ))}
      </div>
      <div className="rounded-2xl border border-nexora-border bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-nexora-ink">Recent orders</h3>
          <Link to="/account/orders" className="text-sm font-medium text-nexora-emerald">View all <ArrowRight size={13} className="inline" /></Link>
        </div>
        {orders.length === 0 ? <p className="py-6 text-center text-sm text-nexora-muted">No orders yet. <Link to="/products" className="font-medium text-nexora-emerald">Start shopping</Link></p> : (
          <div className="divide-y divide-nexora-border">
            {orders.slice(0, 4).map((o) => (
              <div key={o.id} className="flex items-center justify-between py-3 text-sm">
                <div><p className="font-semibold text-nexora-ink">#{o.id.slice(-6).toUpperCase()}</p><p className="text-nexora-muted">{o.shop_name} · {o.items?.length} items</p></div>
                <div className="text-right"><p className="font-bold">{formatBDT(o.total)}</p><span className="rounded-full bg-nexora-mintbg px-2 py-0.5 text-xs font-medium text-nexora-emeraldDark capitalize">{o.status}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
