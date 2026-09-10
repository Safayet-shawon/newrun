import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, ShoppingBag } from "lucide-react";
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

  useEffect(() => { api.get("/categories").then(({ data }) => setCats(data || [])).catch(() => {}); }, []);
  useEffect(() => { setQ(queryFromUrl); }, [queryFromUrl]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setShops(null);
      try {
        const params = { limit: 100 };
        if (cat) params.category = cat;
        if (q.trim()) params.search = q.trim();
        const { data } = await api.get("/shops", { signal: controller.signal, params });
        if (active) setShops(data || []);
      } catch (error) {
        if (active && error.code !== "ERR_CANCELED") setShops([]);
      }
    }, 160);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
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
            <input value={q} onChange={(e) => updateQuery(e.target.value)} placeholder="Search shop name or product — tshirt, genji, sneakers…" className="h-11 w-full rounded-xl border border-[#D3E0EA] bg-white pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald focus:ring-2 focus:ring-nexora-emerald/10" data-testid="shops-search" />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button onClick={() => { const next = new URLSearchParams(sp); next.delete("category"); setSp(next); }} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${!cat ? "bg-nexora-emerald text-white" : "border border-[#D3E0EA] bg-white"}`}>All</button>
            {cats.map((c) => (
              <button key={c.slug} onClick={() => { const next = new URLSearchParams(sp); next.set("category", c.slug); setSp(next); }} data-testid={`shops-filter-${c.slug}`} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${cat === c.slug ? "bg-nexora-emerald text-white" : "border border-[#D3E0EA] bg-white"}`}>{c.name}</button>
            ))}
          </div>
        </div>
        {q && <p className="mt-3 text-xs text-[#55718B]">Live results include direct shop-name matches and any currently published shop carrying products Nexora understands as this search — including common spelling, spacing, plural and Bangladesh-style synonym variants.</p>}
      </div>

      <div className="mt-6">
        {!shops ? <Loader /> : shops.length === 0 ? (
          <EmptyState title="No shops found" description={q ? "No live shop or current catalogue matched this search. Try another spelling or a broader product term." : "Try another category."} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shops.map((shop) => (
              <div key={shop.id} className="min-w-0">
                <ShopCard shop={shop} />
                {q && shop.matching_product_count > 0 && (
                  <div className="mx-2 -mt-2 flex items-center gap-1.5 rounded-b-xl border border-t-0 border-[#D9E6EF] bg-[#F4F8FB] px-3 py-2 text-[11px] font-semibold text-[#4F6A80]">
                    <ShoppingBag size={13} className="text-nexora-emerald" /> {shop.matching_product_count} matching product{shop.matching_product_count === 1 ? "" : "s"} in this shop
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
