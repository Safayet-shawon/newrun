import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { Loader, EmptyState, SectionHeader } from "@/components/shared/Bits";
import BrowseMode from "@/components/marketplace/BrowseMode";
import ShopCard from "@/components/marketplace/ShopCard";

export default function Shops() {
  const [shops, setShops] = useState(null);
  const [cats, setCats] = useState([]);
  const [sp, setSp] = useSearchParams();
  const cat = sp.get("category") || "";
  const [q, setQ] = useState("");

  useEffect(() => { api.get("/categories").then(({ data }) => setCats(data)).catch(() => {}); }, []);
  useEffect(() => {
    const params = { limit: 60 };
    if (cat) params.category = cat;
    if (q) params.search = q;
    const t = setTimeout(() => api.get("/shops", { params }).then(({ data }) => setShops(data)).catch(() => setShops([])), 200);
    return () => clearTimeout(t);
  }, [cat, q]);

  return (
    <div className="nx-container py-8 animate-fade-in">
      <SectionHeader eyebrow="Discover" title="Browse shops" />
      <BrowseMode category={cat} selected="shops" />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shops…" className="h-11 w-full rounded-full border border-nexora-border bg-white pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" data-testid="shops-search" />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <button onClick={() => { sp.delete("category"); setSp(sp); }} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${!cat ? "bg-nexora-emerald text-white" : "border border-nexora-border bg-white"}`}>All</button>
          {cats.map((c) => (
            <button key={c.slug} onClick={() => { sp.set("category", c.slug); setSp(sp); }} data-testid={`shops-filter-${c.slug}`} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${cat === c.slug ? "bg-nexora-emerald text-white" : "border border-nexora-border bg-white"}`}>{c.name}</button>
          ))}
        </div>
      </div>

      {!shops ? <Loader /> : shops.length === 0 ? (
        <EmptyState title="No shops found" description="Try another category." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shops.map((s) => <ShopCard key={s.id} shop={s} />)}
        </div>
      )}
    </div>
  );
}
