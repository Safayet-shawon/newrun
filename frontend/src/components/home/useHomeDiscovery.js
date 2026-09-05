import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { effectivePrice } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

export const collections = [
  { id: "following", label: "Shops You Follow", sort: "popular", detail: "Products only from shops you follow." },
  { id: "trending", label: "Trending Now", sort: "popular", detail: "Popular products, ranked by sales." },
  { id: "selling", label: "Best Selling", sort: "best_selling", detail: "Products with recorded sales, highest first." },
  { id: "best", label: "Best Price", sort: "price_low", detail: "Prices from lowest to highest." },
  { id: "premium", label: "Premium Products", sort: "price_high", detail: "Explore the higher-priced end of the catalogue." },
];
export const initialFilters = { category: "all", collection: "trending", brand: "", query: "", page: 1, saved: false };
export const PAGE_SIZE = 24;

export function buildProductParams(filters, pageSize = PAGE_SIZE) {
  const params = { limit: pageSize, skip: (filters.page - 1) * pageSize, sort: collections.find(c => c.id === filters.collection)?.sort || "popular" };
  if (filters.category !== "all") params.category = filters.category;
  if (filters.query) params.search = filters.query.trim();
  if (filters.brand) params.brand = filters.brand;
  if (filters.collection === "following") params.following = true;
  return params;
}

function matchesSearch(product, query) {
  const text = `${product.title} ${product.shop_name} ${product.brand || ""} ${product.category} ${(product.search_terms || []).join(" ")}`.toLowerCase();
  const term = query.trim().toLowerCase();
  return ["men","women"].includes(term) ? text.split(/[^a-z]+/).includes(term) : text.includes(term);
}

export function selectDemoProducts(products, filters, saved = []) {
  const result = products.filter(p => (filters.category === "all" || p.category === filters.category)
    && (!filters.brand || p.brand === filters.brand)
    && (!filters.saved || saved.includes(p.id))
    && (!filters.query || matchesSearch(p, filters.query)));
  if (filters.collection === "best") result.sort((a,b) => effectivePrice(a) - effectivePrice(b));
  if (filters.collection === "new") result.sort((a,b) => (b.previewOrder || 0) - (a.previewOrder || 0));
  return { total: result.length, items: result.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE) };
}

export default function useHomeDiscovery({ ready, isDemo, demoProducts, saved }) {
  const { user } = useAuth();
  const [pageSize,setPageSize] = useState(PAGE_SIZE);
  useEffect(()=>{
    const resize=()=>setPageSize(window.innerWidth<=560 ? 8 : Math.max(1,Math.floor((window.innerWidth-56+18)/228))*4);
    resize(); window.addEventListener("resize",resize);
    return ()=>window.removeEventListener("resize",resize);
  },[]);
  const [filters, setFilters] = useState(initialFilters);
  const [live, setLive] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const update = changes => setFilters(old => ({ ...old, page: 1, ...changes }));
  useEffect(() => {
    if (!ready || isDemo) return;
    if (filters.collection === "following" && !user) { setLive({items:[],total:0}); setLoading(false); setError(false); return; }
    const controller = new AbortController();
    setLoading(true); setError(false);
    const params = buildProductParams(filters, pageSize);
    api.get("/products", { params, signal: controller.signal, timeout: 8000 }).then(({ data }) => setLive(data)).catch(e => { if (e.code !== "ERR_CANCELED") setError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ready, isDemo, filters, retry, pageSize, user]);
  const demo = useMemo(() => selectDemoProducts(demoProducts, filters, saved), [demoProducts, filters, saved]);
  return { filters, update, reset: () => setFilters(initialFilters), items: isDemo ? demo.items : live.items,
    pageSize, total: isDemo ? demo.total : live.total, loading: !ready || (!isDemo && loading), error: !isDemo && error,
    retry: () => setRetry(n => n + 1) };
}
