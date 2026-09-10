import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  const queryFromUrl = sp.get("q") || sp.get("search") || "";
  const [q, setQ] = useState(queryFromUrl);

  useEffect(() => { api.get("/categories").then(({ data }) => setCats(data)).catch(() => {}); }, []);
  useEffect(() => { setQ(queryFromUrl); }, [queryFromUrl]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setShops(null);
      try {
        const value = q.trim();
        const shopParams = { limit: 60 };
        if (cat) shopParams.category = cat;

        if (!value) {
          const { data } = await api.get("/shops", { params: shopParams });
          if (active) setShops(data || []);
          return;
        }

        const productParams = { search: value, limit: 60 };
        if (cat) productParams.category = cat;

        const [allShopsResult, productsResult, directShopsResult] = await Promise.allSettled([
          api.get("/shops", { params: shopParams }),
          api.get("/products", { params: productParams }),
          api.get("/shops", { params: { ...shopParams, search: value } }),
        ]);

        const allShops = allShopsResult.status === "fulfilled" ? (allShopsResult.value.data || []) : [];
        const products = productsResult.status === "fulfilled" ? (productsResult.value.data?.items || []) : [];
        const directShops = directShopsResult.status === "fulfilled" ? (directShopsResult.value.data || []) : [];
        const carryingSlugs = new Set(products.map((p) => p.shop_slug).filter(Boolean));
        const directSlugs = new Set(directShops.map((s) => s.slug).filter(Boolean));
        const result = allShops.filter((shop) => carryingSlugs.has(shop.slug) || directSlugs.has(shop.slug));

        if (active) setShops(result);
      } catch {
        if (active) setShops([]);
      }
    }, 180);

    return () => { active = false; clearTimeout(timer); };
  }, [cat, q]);

  const updateQuery = (value) => {
    setQ(value);
    const next = new URLSearchParams(sp);
    if (value.trim()) next.set("q", value);
    else next.delete("q");
    setSp(next, { replace: true });
  };

  return (
    <div className="nx-container py-6 sm:py-8 animate-fade-in">
      <div className="rounded-3xl border border-[#D7E3EE] bg-gradient-to-r from-[#EAF2FB] via-white to-[#EEF8F3] p-5 sm:p-7">
        <SectionHeader eyebrow="Discover" title={q ? `Shops carrying “${q}”` : "Browse shops"} />
        <BrowseMode category={cat} selected="shops" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
            <input value={q} onChange={(e) => updateQuery(e.target.value)} placeholder="Search a shop or product, e.g. t-shirt…" className="h-11 w-full rounded-xl border border-[#D3E0EA] bg-white pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald focus:ring-2 focus:ring-nexora-emerald/10" data-testid="shops-search" />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button onClick={() => { const next = new URLSearchParams(sp); next.delete("category"); setSp(next); }} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${!cat ? "bg-nexora-emerald text-white" : "border border-[#D3E0EA] bg-white"}`}>All</button>
            {cats.map((c) => (
              <button key={c.slug} onClick={() => { const next = new URLSearchParams(sp); next.set("category", c.slug); setSp(next); }} data-testid={`shops-filter-${c.slug}`} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${cat === c.slug ? "bg-nexora-emerald text-white" : "border border-[#D3E0EA] bg-white"}`}>{c.name}</button>
            ))}
          </div>
        </div>
        {q && <p className="mt-3 text-xs text-[#55718B]">Results include shops whose own profile matches your search and shops that currently carry matching products.</p>}
      </div>

      <div className="mt-6">
        {!shops ? <Loader /> : shops.length === 0 ? (
          <EmptyState title="No shops found" description={q ? "No current shop or catalogue matched this search. Try a broader product term." : "Try another category."} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shops.map((s) => <ShopCard key={s.id} shop={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}
