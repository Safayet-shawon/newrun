import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search, Store, BadgeCheck, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { Loader, EmptyState } from "@/components/shared/Bits";
import BrowseMode from "@/components/marketplace/BrowseMode";
import ShopCard from "@/components/marketplace/ShopCard";

export default function Shops() {
  const [shops, setShops] = useState(null);
  const [cats, setCats] = useState([]);
  const [sp, setSp] = useSearchParams();
  const cat = sp.get("category") || "";
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get("/categories").then(({ data }) => setCats(data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const params = { limit: 60 };
    if (cat) params.category = cat;
    if (q.trim()) params.search = q.trim();
    const timer = setTimeout(() => {
      api.get("/shops", { params }).then(({ data }) => setShops(data || [])).catch(() => setShops([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [cat, q]);

  const setCategory = (slug) => {
    const next = new URLSearchParams(sp);
    if (slug) next.set("category", slug);
    else next.delete("category");
    setSp(next);
  };

  return (
    <div className="nx-container py-6 sm:py-8 animate-fade-in">
      <section className="overflow-hidden rounded-3xl border border-nexora-border bg-white shadow-sm">
        <div className="grid gap-6 bg-gradient-to-br from-white via-white to-nexora-mintbg/70 p-5 sm:p-7 lg:grid-cols-[1fr_320px] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-nexora-mintbg px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-nexora-emeraldDark">
              <Store size={13} /> Independent shops
            </span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-nexora-ink sm:text-4xl">Discover shops worth coming back to.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-nexora-muted">Browse independent sellers by category, find trusted storefronts and follow the shops you love.</p>
            <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-nexora-muted">
              <span className="inline-flex items-center gap-1.5"><BadgeCheck size={15} className="text-nexora-emerald" /> Seller identity & ratings</span>
              <span className="inline-flex items-center gap-1.5"><Store size={15} className="text-nexora-emerald" /> Dedicated storefronts</span>
            </div>
          </div>
          <Link to="/seller/signup" className="rounded-2xl border border-[#CDEFE2] bg-white/80 p-4 transition hover:-translate-y-0.5 hover:shadow-sm">
            <small className="font-bold uppercase tracking-[0.13em] text-nexora-emerald">Sell on Nexora</small>
            <b className="mt-1 block text-lg text-nexora-ink">Build your own storefront</b>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-nexora-emerald">Become a seller <ArrowRight size={13} /></span>
          </Link>
        </div>

        <div className="border-t border-nexora-border p-4 sm:p-5">
          <BrowseMode category={cat} selected="shops" />
          <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shop names or what they sell..." className="h-11 w-full rounded-xl border border-nexora-border bg-[#FBFDFC] pl-11 pr-4 text-sm outline-none transition focus:border-nexora-emerald focus:bg-white focus:ring-2 focus:ring-nexora-emerald/10" data-testid="shops-search" />
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <button onClick={() => setCategory("")} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition ${!cat ? "bg-nexora-emerald text-white" : "border border-nexora-border bg-white text-nexora-muted hover:bg-nexora-mintbg hover:text-nexora-emeraldDark"}`}>All shops</button>
              {cats.map((category) => (
                <button key={category.slug} onClick={() => setCategory(category.slug)} data-testid={`shops-filter-${category.slug}`} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition ${cat === category.slug ? "bg-nexora-emerald text-white" : "border border-nexora-border bg-white text-nexora-muted hover:bg-nexora-mintbg hover:text-nexora-emeraldDark"}`}>
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-nexora-ink">{cat ? `${cats.find((item) => item.slug === cat)?.name || "Category"} shops` : "All shops"}</h2>
          <p className="mt-0.5 text-xs text-nexora-muted">{shops ? `${shops.length} storefront${shops.length === 1 ? "" : "s"} found` : "Finding shops..."}</p>
        </div>
        <Link to="/products" className="hidden items-center gap-1 text-xs font-bold text-nexora-emerald sm:inline-flex">Browse products <ArrowRight size={13} /></Link>
      </div>

      <div className="mt-4">
        {!shops ? <Loader /> : shops.length === 0 ? (
          <EmptyState title="No shops found" description="Try another category or search term." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shops.map((shop) => <ShopCard key={shop.id} shop={shop} />)}
          </div>
        )}
      </div>
    </div>
  );
}
