import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  ShoppingCart,
  Package,
  Star,
  AlertTriangle,
  ArrowRight,
  Eye,
  Rocket,
  ExternalLink,
  Sparkles,
  BarChart3,
  Globe2,
  PlusCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import { useSeller } from "@/context/SellerContext";
import { formatBDT } from "@/lib/format";
import { PLAN_META } from "@/lib/entitlements";
import { toast } from "sonner";

export default function Overview() {
  const { shop, plan, reload } = useSeller();
  const [data, setData] = useState(null);
  const [intel, setIntel] = useState(null);

  useEffect(() => {
    api.get("/seller/overview").then(({ data }) => setData(data));
  }, []);

  const isStart = plan?.id === "start";
  const isGrow = plan?.id === "grow";
  const isPro = plan?.id === "pro";

  useEffect(() => {
    if (!isPro) return;
    api.get("/seller/intelligence/overview")
      .then(({ data }) => setIntel(data))
      .catch(() => {});
  }, [isPro]);

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

  const topOpportunity = intel?.opportunities?.[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-nexora-ink">Welcome back 👋</h1>
        <p className="text-sm text-nexora-muted">Here's what's happening with {shop?.name}.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Quick actions">
        <Link to="/seller/dashboard/products/new" className="group flex items-center gap-3 rounded-2xl border border-nexora-border bg-white p-4 transition hover:border-nexora-emerald/40 hover:shadow-sm">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-nexora-mintbg text-nexora-emerald"><PlusCircle size={19} /></span>
          <span><b className="block text-sm text-nexora-ink">Add a product</b><small className="text-nexora-muted">Create one manually</small></span>
          <ArrowRight size={15} className="ml-auto text-nexora-muted transition group-hover:translate-x-0.5" />
        </Link>
        {isPro ? (
          <Link to="/seller/dashboard/import-store" className="group flex items-center gap-3 rounded-2xl border border-nexora-emerald/25 bg-nexora-mintbg p-4 transition hover:shadow-sm">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-nexora-emerald"><Globe2 size={19} /></span>
            <span><b className="block text-sm text-nexora-ink">Import a website</b><small className="text-nexora-muted">Scan and add products</small></span>
            <ArrowRight size={15} className="ml-auto text-nexora-emerald transition group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <Link to="/seller/dashboard/subscription" className="group flex items-center gap-3 rounded-2xl border border-nexora-border bg-white p-4 transition hover:shadow-sm">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#FFF1CC] text-[#A96D00]"><Globe2 size={19} /></span>
            <span><b className="block text-sm text-nexora-ink">Website import</b><small className="text-nexora-muted">Available on PRO</small></span>
            <ArrowRight size={15} className="ml-auto text-nexora-muted" />
          </Link>
        )}
        <Link to="/seller/dashboard/analytics" className="group flex items-center gap-3 rounded-2xl border border-nexora-border bg-white p-4 transition hover:border-nexora-emerald/40 hover:shadow-sm">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EEF4FF] text-[#3B82F6]"><BarChart3 size={19} /></span>
          <span><b className="block text-sm text-nexora-ink">Revenue report</b><small className="text-nexora-muted">Daily to yearly graphs</small></span>
          <ArrowRight size={15} className="ml-auto text-nexora-muted transition group-hover:translate-x-0.5" />
        </Link>
      </section>

      {isStart && (
        <section className="rounded-3xl border border-nexora-border bg-gradient-to-r from-[#F8FAF9] to-white p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="rounded-full bg-[#EEF1EF] px-2.5 py-1 text-xs font-extrabold text-nexora-muted">START</span>
              <h2 className="mt-3 text-xl font-extrabold text-nexora-ink">Start selling with the essentials.</h2>
              <p className="mt-1 text-sm text-nexora-muted">Products, orders, inventory, logo and cover — everything needed to launch.</p>
            </div>
            <Link to="/seller/dashboard/subscription" className="nx-btn-primary whitespace-nowrap">Unlock GROW <ArrowRight size={15} /></Link>
          </div>
        </section>
      )}

      {isGrow && (
        <section className="rounded-3xl border border-nexora-emerald/25 bg-gradient-to-r from-nexora-mintbg via-white to-white p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-nexora-emerald">GROW</span>
              <h2 className="mt-3 text-xl font-extrabold text-nexora-ink">Your growth toolkit is active.</h2>
              <p className="mt-1 text-sm text-nexora-muted">Use advanced analytics, customer insights, marketing and bulk catalogue tools.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/seller/dashboard/analytics" className="nx-btn-ghost"><BarChart3 size={15} /> Analytics</Link>
              <Link to="/seller/dashboard/customers" className="nx-btn-primary">Customer insights <ArrowRight size={15} /></Link>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-nexora-amber/25 bg-[#FFFCF5] p-4 text-sm">
            <b className="text-nexora-ink">Want marketplace-wide demand intelligence?</b>
            <span className="text-nexora-muted"> Upgrade to PRO to see demand gaps, anonymous pricing benchmarks and website auto-sync.</span>
          </div>
        </section>
      )}

      {isPro && (
        <section className="overflow-hidden rounded-3xl border border-nexora-amber/30 bg-gradient-to-br from-[#FFF9ED] via-white to-nexora-mintbg p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF1CC] px-2.5 py-1 text-xs font-extrabold text-[#A96D00]">
                <Sparkles size={13} /> PRO · NEXORA INTELLIGENCE
              </span>
              <h2 className="mt-3 text-2xl font-extrabold text-nexora-ink">
                {topOpportunity ? `${topOpportunity.category} is your strongest current opportunity.` : "Your marketplace intelligence is active."}
              </h2>
              <p className="mt-1 text-sm text-nexora-muted">
                {topOpportunity
                  ? `Opportunity ${topOpportunity.opportunity_score}/100 · ${topOpportunity.competition} competition · ${topOpportunity.confidence} confidence.`
                  : "As Nexora collects marketplace activity, this panel will surface demand and supply gaps matched to your catalogue."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/seller/dashboard/intelligence" className="nx-btn-primary"><Sparkles size={15} /> Open Intelligence</Link>
              <Link to="/seller/dashboard/import-store" className="nx-btn-ghost"><Globe2 size={15} /> Import Store</Link>
            </div>
          </div>
        </section>
      )}

      <div
        className={`flex flex-col items-start justify-between gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center ${published ? "border-nexora-emerald/30 bg-nexora-mintbg" : "border-nexora-amber/30 bg-[#FFFCF5]"}`}
        data-testid="store-status-card"
      >
        <div className="flex items-center gap-3">
          <div className={`grid h-11 w-11 place-items-center rounded-xl ${published ? "bg-nexora-emerald text-white" : "bg-nexora-amber text-white"}`}>
            <Rocket size={20} />
          </div>
          <div>
            <p className="font-bold text-nexora-ink">{published ? "Your store is live" : "Your store is in draft"}</p>
            <p className="text-sm text-nexora-muted">{published ? "Customers can discover and buy from your storefront." : "Publish to make your storefront visible to customers."}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <a href={`/shop/${shop?.slug}`} target="_blank" rel="noreferrer" className="nx-btn-ghost" data-testid="overview-view-store">
            <Eye size={15} /> View as customer <ExternalLink size={13} />
          </a>
          <button onClick={publish} className="nx-btn-primary" data-testid="overview-publish-toggle">{published ? "Unpublish" : "Publish store"}</button>
        </div>
      </div>

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
        <div className="rounded-2xl border border-nexora-border bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold text-nexora-ink">Recent orders</h3>
            <Link to="/seller/dashboard/orders" className="text-sm font-medium text-nexora-emerald">All <ArrowRight size={13} className="inline" /></Link>
          </div>
          {data.recent_orders?.length ? (
            <div className="divide-y divide-nexora-border">
              {data.recent_orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium text-nexora-ink">#{o.id.slice(-6).toUpperCase()}</span>
                  <span className="text-nexora-muted">{o.customer_name}</span>
                  <span className="font-bold">{formatBDT(o.total)}</span>
                </div>
              ))}
            </div>
          ) : <p className="py-6 text-center text-sm text-nexora-muted">No orders yet.</p>}
        </div>

        <div className="rounded-2xl border border-nexora-border bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 font-bold text-nexora-ink"><AlertTriangle size={16} className="text-nexora-amber" /> Low stock</h3>
            <Link to="/seller/dashboard/inventory" className="text-sm font-medium text-nexora-emerald">Manage <ArrowRight size={13} className="inline" /></Link>
          </div>
          {data.low_stock?.length ? (
            <div className="divide-y divide-nexora-border">
              {data.low_stock.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="line-clamp-1 text-nexora-ink">{p.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.stock === 0 ? "bg-[#FFEDE5] text-nexora-coral" : "bg-[#FEF3E2] text-nexora-amber"}`}>{p.stock} left</span>
                </div>
              ))}
            </div>
          ) : <p className="py-6 text-center text-sm text-nexora-muted">All products well stocked.</p>}
        </div>
      </div>

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
