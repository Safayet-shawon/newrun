import React, { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import { SlidersHorizontal, X } from "lucide-react";
import { api } from "@/lib/api";
import { Loader, EmptyState, SectionHeader } from "@/components/shared/Bits";
import ProductCard from "@/components/marketplace/ProductCard";

const SORTS = [
  ["popular", "Most popular"],
  ["newest", "Newest"],
  ["price_low", "Price: Low to High"],
  ["price_high", "Price: High to Low"],
  ["rating", "Top rated"],
];

export default function ProductListing() {
  const { slug } = useParams();
  const location = useLocation();
  const [sp, setSp] = useSearchParams();
  const [cats, setCats] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const isDeals = location.pathname === "/deals";
  const search = sp.get("q") || "";
  const brand = sp.get("brand") || "";
  const sort = sp.get("sort") || "popular";
  const activeCat = slug || sp.get("category") || "";

  useEffect(() => { api.get("/categories").then(({ data }) => setCats(data)).catch(() => {}); }, []);

  useEffect(() => {
    setLoading(true);
    const params = { sort, limit: 60 };
    if (activeCat) params.category = activeCat;
    if (search) params.search = search;
    if (brand) params.brand = brand;
    api.get("/products", { params }).then(({ data }) => {
      let items = data.items;
      if (isDeals) items = items.filter((p) => p.discount_price != null);
      setData({ ...data, items });
    }).finally(() => setLoading(false));
  }, [activeCat, search, brand, sort, isDeals]);

  const title = isDeals ? "Deals & Discounts" : search ? `Results for “${search}”` : brand ? brand : activeCat ? cats.find((c) => c.slug === activeCat)?.name || "Products" : "All Products";

  const setSort = (v) => { sp.set("sort", v); setSp(sp, { replace: true }); };

  return (
    <div className="nx-container py-8 animate-fade-in">
      <SectionHeader eyebrow={isDeals ? "Save more" : "Marketplace"} title={title}
        action={<button onClick={() => setShowFilters((s) => !s)} className="nx-btn-ghost lg:hidden" data-testid="toggle-filters"><SlidersHorizontal size={15} /> Filters</button>} />

      <div className="flex gap-8">
        {/* Sidebar filters */}
        <aside className={`${showFilters ? "fixed inset-0 z-50 bg-nexora-ink/40 lg:static lg:bg-transparent" : "hidden"} lg:block lg:w-60 lg:shrink-0`}>
          <div className={`${showFilters ? "absolute right-0 top-0 h-full w-72 overflow-y-auto bg-white p-5 lg:static lg:w-full lg:p-0" : ""}`}>
            <div className="mb-4 flex items-center justify-between lg:hidden">
              <span className="font-bold">Filters</span>
              <button onClick={() => setShowFilters(false)}><X size={22} /></button>
            </div>
            <div className="rounded-2xl border border-nexora-border bg-white p-4 lg:p-5">
              <h4 className="mb-3 text-sm font-bold text-nexora-ink">Categories</h4>
              <Link to="/products" className={`block rounded-lg px-2 py-1.5 text-sm ${!activeCat ? "bg-nexora-mintbg font-semibold text-nexora-emeraldDark" : "text-nexora-muted hover:text-nexora-ink"}`}>All categories</Link>
              {cats.map((c) => (
                <Link key={c.slug} to={`/category/${c.slug}`} data-testid={`filter-cat-${c.slug}`}
                  className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-sm ${activeCat === c.slug ? "bg-nexora-mintbg font-semibold text-nexora-emeraldDark" : "text-nexora-muted hover:text-nexora-ink"}`}>
                  {c.name} <span className="text-xs">{c.product_count}</span>
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm text-nexora-muted">{loading ? "Loading…" : `${data?.items?.length || 0} products`}</p>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-full border border-nexora-border bg-white px-4 py-2 text-sm font-medium outline-none focus:border-nexora-emerald" data-testid="sort-select">
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {loading ? <Loader /> : !data?.items?.length ? (
            <EmptyState title="No products found" description="Try a different category or search term." action={<Link to="/products" className="nx-btn-primary mt-2">Browse all</Link>} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {data.items.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
