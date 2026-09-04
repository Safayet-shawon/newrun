import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, ShoppingCart, Package, Star, AlertTriangle, ArrowRight, Eye, Rocket, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import { useSeller } from "@/context/SellerContext";
import { formatBDT } from "@/lib/format";
import { PLAN_META } from "@/lib/entitlements";
import { toast } from "sonner";

export default function Overview() {
  const { shop, plan, reload } = useSeller();
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/seller/overview").then(({ data }) => setData(data)); }, []);
  if (!data) return <Loader />;

  const m = data.metrics;
  const cards = [
    { icon: TrendingUp, label: "Revenue", value: formatBDT(m.revenue || 0), tone: "bg-nexora-mintbg text-nexora-emerald" },
    { icon: ShoppingCart, label: "Orders", value: m.orders || 0, tone: "bg-[#EEF4FF] text-[#3B82F6]" },
    { icon: Package, label: "Products", value: m.products || 0, tone: "bg-[#FEF3E2] text-nexora-amber" },
    { icon: Star, label: "Rating", value: (m.rating || 0).toFixed(1), tone: "bg-[#FFEDE5] text-nexora-coral" },
  ];
  const published = shop?.status === "published";

  const publish = async () => {
    await api.post(`/seller/shop/${published ? "unpublish" : "publish"}`);
    await reload();
    toast.success(published ? "Store unpublished" : "Store is now live!");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-nexora-ink">Welcome back 👋</h1>
        <p className="text-sm text-nexora-muted">Here's what's happening with {shop?.name}.</p>
      </div>

      {/* store status */}
      <div className={`flex flex-col items-start justify-between gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center ${published ? "border-nexora-emerald/30 bg-nexora-mintbg" : "border-nexora-amber/30 bg-[#FFFCF5]"}`} data-testid="store-status-card">
        <div className="flex items-center gap-3">
          <div className={`grid h-11 w-11 place-items-center rounded-xl ${published ? "bg-nexora-emerald text-white" : "bg-nexora-amber text-white"}`}><Rocket size={20} /></div>
          <div>
            <p className="font-bold text-nexora-ink">{published ? "Your store is live" : "Your store is in draft"}</p>
            <p className="text-sm text-nexora-muted">{published ? "Customers can discover and buy from your storefront." : "Publish to make your storefront visible to customers."}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <a href={`/shop/${shop?.slug}`} target="_blank" rel="noreferrer" className="nx-btn-ghost" data-testid="overview-view-store"><Eye size={15} /> View as customer <ExternalLink size={13} /></a>
          <button onClick={publish} className="nx-btn-primary" data-testid="overview-publish-toggle">{published ? "Unpublish" : "Publish store"}</button>
        </div>
      </div>

      {/* metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-nexora-border bg-white p-5" data-testid={`metric-${c.label.toLowerCase()}`}>
            <div className={`grid h-10 w-10 place-items-center rounded-xl ${c.tone}`}><c.icon size={18} /></div>
            <p className="mt-3 text-2xl font-extrabold text-nexora-ink">{c.value}</p>
            <p className="text-sm text-nexora-muted">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* recent orders */}
        <div className="rounded-2xl border border-nexora-border bg-white p-5">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-nexora-ink">Recent orders</h3><Link to="/seller/dashboard/orders" className="text-sm font-medium text-nexora-emerald">All <ArrowRight size={13} className="inline" /></Link></div>
          {data.recent_orders?.length ? (
            <div className="divide-y divide-nexora-border">
              {data.recent_orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between py-2.5 text-sm"><span className="font-medium text-nexora-ink">#{o.id.slice(-6).toUpperCase()}</span><span className="text-nexora-muted">{o.customer_name}</span><span className="font-bold">{formatBDT(o.total)}</span></div>
              ))}
            </div>
          ) : <p className="py-6 text-center text-sm text-nexora-muted">No orders yet.</p>}
        </div>

        {/* low stock */}
        <div className="rounded-2xl border border-nexora-border bg-white p-5">
          <div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-1.5 font-bold text-nexora-ink"><AlertTriangle size={16} className="text-nexora-amber" /> Low stock</h3><Link to="/seller/dashboard/inventory" className="text-sm font-medium text-nexora-emerald">Manage <ArrowRight size={13} className="inline" /></Link></div>
          {data.low_stock?.length ? (
            <div className="divide-y divide-nexora-border">
              {data.low_stock.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5 text-sm"><span className="line-clamp-1 text-nexora-ink">{p.title}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.stock === 0 ? "bg-[#FFEDE5] text-nexora-coral" : "bg-[#FEF3E2] text-nexora-amber"}`}>{p.stock} left</span></div>
              ))}
            </div>
          ) : <p className="py-6 text-center text-sm text-nexora-muted">All products well stocked.</p>}
        </div>
      </div>

      {/* subscription summary */}
      {plan && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-nexora-border bg-white p-5 sm:flex-row sm:items-center" data-testid="subscription-summary">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-nexora-muted">Your plan</p>
            <p className="text-xl font-extrabold" style={{ color: PLAN_META[plan.id]?.color }}>{plan.name} · ৳{plan.price_bdt.toLocaleString()}/mo</p>
          </div>
          <Link to="/seller/dashboard/subscription" className="nx-btn-ghost">Manage subscription <ArrowRight size={15} /></Link>
        </div>
      )}
    </div>
  );
}
