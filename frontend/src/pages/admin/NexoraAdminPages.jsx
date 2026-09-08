import React from "react";
import { Loader } from "@/components/shared/Bits";
import { Header, Card, useGet, money } from "./OwnerShared";

export function OwnerOverview() {
  const [data] = useGet("/admin/overview");
  if (!data) return <Loader label="Loading owner overview" />;
  const m = data.metrics || {};
  return <><Header title="Overview">Platform-wide snapshot of Nexora.</Header>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <Card label="Gross Revenue" value={money(m.gross_revenue_bdt)} /><Card label="Orders" value={m.orders || 0} />
      <Card label="Buyers" value={m.customers || 0} tone="sky" /><Card label="Sellers" value={m.sellers || 0} />
      <Card label="Shops" value={m.shops || 0} /><Card label="Products" value={m.products || 0} />
    </div>
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-800">Order pipeline</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{Object.entries(data.order_statuses || {}).map(([k, v]) => <Card key={k} label={k} value={v} />)}</div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-800">Recent orders</h2><div className="mt-3 divide-y divide-slate-100">{(data.recent_orders || []).map((o) => <div key={o.id} className="flex justify-between py-3 text-sm"><span><b>{o.id}</b><small className="block text-slate-400">{o.customer_name || o.customer_email}</small></span><span className="text-right">{money(o.total)}<small className="block capitalize text-slate-400">{o.status}</small></span></div>)}</div></section>
    </div></>;
}

export { SellersSubscriptions, CategoriesAdmin, FeaturedShops } from "./OwnerMarketplacePages";
export { RevenueCommission, BuyersCustomers, PendingConfirmations, AddSubscription, OwnerSettings } from "./OwnerBusinessPages";
