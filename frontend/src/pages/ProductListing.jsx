import React, { useEffect, useState } from "react";
import { useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import { SlidersHorizontal, X } from "lucide-react";
import { api } from "@/lib/api";
import { Loader, EmptyState, SectionHeader } from "@/components/shared/Bits";
import BrowseMode from "@/components/marketplace/BrowseMode";
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
  const [error, setError] = useState(false);

  const isDeals = location.pathname === "/deals";
  const search = sp.get("q") || "";
  const brand = sp.get("brand") || "";
  const sort = sp.get("sort") || "popular";
  const minPrice = sp.get("min_price") || "";
  const maxPrice = sp.get("max_price") || "";
  const activeCat = slug || sp.get("category") || "";

  useEffect(() => {
    api.get("/categories").then(({ data }) => setCats(data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(false);
    const params = { sort, limit: 60 };
    if (activeCat) params.category = activeCat;
    if (search) params.search = search;
    if (brand) params.brand = brand;
    if (minPrice) params.min_price = minPrice;
    if (maxPrice) params.max_price = maxPrice;
    api.get("/products", { params }).then(({ data }) => {
      let items = data.items;
      if (isDeals) items = items.filter((product) => product.discount_price != null);
      setData({ ...data, items });
    }).catch(() => {
      setError(true);
      setData(null);
    }).finally(() => setLoading(false));
  }, [activeCat, search, brand, sort, minPrice, maxPrice, isDeals]);

  const categoryName = cats.find((category) => category.slug === activeCat)?.name;
  const title = isDeals
    ? "Deals & Discounts"
    : search
      ? `Results for “${search}”`
      : brand
        ? brand
        : maxPrice
          ? `Shop under ৳${Number(maxPrice).toLocaleString()}`
          : activeCat
            ? categoryName || "Products"
            : "All Products";

  const setSort = (value) => {
    const next = new URLSearchParams(sp);
    next.set("sort", value);
    setSp(next, { replace: true });
  };

  return (
    <div className="nx-container py-6 sm:py-8 animate-fade-in">
      <div className="mb-6 rounded-3xl border border-nexora-border bg-white p-5 shadow-sm sm:p-6">
        <SectionHeader
          eyebrow={isDeals ? "Save more" : "Marketplace"}
          title={title}
          action={<button onClick={() => setShowFilters((state) => !state)} className="nx-btn-ghost lg:hidden" data-testid="toggle-filters"><SlidersHorizontal size={15} /> Filters</button>}
        />
        <BrowseMode category={activeCat} selected="products" />
      </div>

      {error && <p role="alert" className="mb-5 rounded-2xl border border-[#F7D6C6] bg-[#FFF7F2] p-4 text-sm text-nexora-coral">The catalogue is unavailable. Please try again shortly.</p>}

      <div className="flex gap-7">
        <aside className={`${showFilters ? "fixed inset-0 z-50 bg-nexora-ink/40 lg:static lg:bg-transparent" : "hidden"} lg:block lg:w-60 lg:shrink-0`}>
          <div className={`${showFilters ? "absolute right-0 top-0 h-full w-72 overflow-y-auto bg-white p-5 lg:static lg:w-full lg:p-0" : ""}`}>
            <div className="mb-4 flex items-center justify-between lg:hidden">
              <span className="font-bold">Filters</span>
              <button onClick={() => setShowFilters(false)} aria-label="Close filters"><X size={22} /></button>
            </div>
            <div className="rounded-2xl border border-nexora-border bg-white p-4 shadow-sm lg:p-5">
              <h4 className="mb-3 text-sm font-bold text-nexora-ink">Categories</h4>
              <Link to="/products" className={`block rounded-xl px-2.5 py-2 text-sm ${!activeCat ? "bg-nexora-mintbg font-semibold text-nexora-emeraldDark" : "text-nexora-muted hover:bg-nexora-mintbg hover:text-nexora-ink"}`}>All categories</Link>
              {cats.map((category) => (
                <Link key={category.slug} to={`/category/${category.slug}`} data-testid={`filter-cat-${category.slug}`} className={`flex items-center justify-between rounded-xl px-2.5 py-2 text-sm ${activeCat === category.slug ? "bg-nexora-mintbg font-semibold text-nexora-emeraldDark" : "text-nexora-muted hover:bg-nexora-mintbg hover:text-nexora-ink"}`}>
                  {category.name} <span className="text-xs">{category.product_count}</span>
                </Link>
              ))}

              {(minPrice || maxPrice) && (
                <div className="mt-5 border-t border-nexora-border pt-4">
                  <h4 className="text-sm font-bold text-nexora-ink">Active price filter</h4>
                  <p className="mt-1 text-xs text-nexora-muted">{minPrice ? `From ৳${Number(minPrice).toLocaleString()}` : ""}{minPrice && maxPrice ? " · " : ""}{maxPrice ? `Up to ৳${Number(maxPrice).toLocaleString()}` : ""}</p>
                  <Link to={activeCat ? `/category/${activeCat}` : "/products"} className="mt-3 inline-flex text-xs font-bold text-nexora-emerald">Clear price filter</Link>
                </div>
              )}
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-5 flex items-center justify-between rounded-2xl border border-nexora-border bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-nexora-muted">{loading ? "Loading…" : `${data?.items?.length || 0} products`}</p>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-xl border border-nexora-border bg-white px-3 py-2 text-sm font-medium outline-none focus:border-nexora-emerald" data-testid="sort-select">
              {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          {loading ? <Loader /> : !data?.items?.length ? (
            <EmptyState title="No products found" description="Try a different category, price range or search term." action={<Link to="/products" className="nx-btn-primary mt-2">Browse all</Link>} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {data.items.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
