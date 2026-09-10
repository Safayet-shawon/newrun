import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Camera, Images, Search, Store, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { api, resolveImage } from "@/lib/api";
import { effectivePrice, formatBDT } from "@/lib/format";

const MODES = [
  ["all", "All"],
  ["products", "Products"],
  ["shops", "Shops"],
  ["brands", "Brands"],
];

export default function SmartSearch({ mobile = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const wrapperRef = useRef(null);
  const fileRef = useRef(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("all");
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [data, setData] = useState({ products: [], shops: [], brands: [], categories: [], searches: [], query: null });

  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);

  useEffect(() => {
    const close = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    const value = q.trim();
    if (value.length < 2) {
      setData({ products: [], shops: [], brands: [], categories: [], searches: [], query: null });
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data: result } = await api.get("/search/suggest", { signal: controller.signal, params: { q: value, limit: 6 } });
        setData(result || {});
      } catch (error) {
        if (error.code !== "ERR_CANCELED") setData({ products: [], shops: [], brands: [], categories: [], searches: [], query: null });
      } finally {
        setLoading(false);
      }
    }, 160);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q]);

  const canonical = data?.query?.canonical || "";
  const understoodDifferently = canonical && canonical !== (data?.query?.normalized || "");
  const products = data?.products || [];
  const shops = data?.shops || [];
  const brands = data?.brands || [];
  const categories = data?.categories || [];
  const searches = data?.searches || [];

  const hasResults = products.length || shops.length || brands.length || categories.length || searches.length;

  const submit = (event) => {
    event?.preventDefault?.();
    const value = q.trim();
    if (!value) return;
    setOpen(false);
    if (mode === "shops") navigate(`/shops?q=${encodeURIComponent(value)}`);
    else if (mode === "brands") navigate(`/products?brand=${encodeURIComponent(value)}`);
    else navigate(`/search?q=${encodeURIComponent(value)}`);
  };

  const imageSearch = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image must be 8 MB or smaller");
      return;
    }
    setImageLoading(true);
    setOpen(false);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data: result } = await api.post("/search/image", form, { params: { limit: 30 } });
      const preview = URL.createObjectURL(file);
      navigate("/visual-search", { state: { items: result?.items || [], totalCompared: result?.total_compared || 0, note: result?.note, preview, filename: file.name } });
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Could not search this photo");
    } finally {
      setImageLoading(false);
    }
  };

  const shopSubtitle = (shop) => {
    const count = shop.matching_product_count ?? shop.matching_count ?? 0;
    if (count > 0) return `${count} matching product${count === 1 ? "" : "s"}`;
    if (shop.matched_by === "shop") return "Shop name/profile match";
    return `${shop.product_count || 0} products`;
  };

  const placeholder = "Search products, shops or brands…";

  return (
    <div ref={wrapperRef} className="relative w-full">
      <form onSubmit={submit} className="relative">
        <Search size={mobile ? 16 : 17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-nexora-muted sm:left-4" />
        <input
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQ(event.target.value); setOpen(true); }}
          placeholder={placeholder}
          autoComplete="off"
          className={`${mobile ? "h-10 pl-10 pr-[84px]" : "h-11 pl-11 pr-[94px]"} w-full rounded-xl border border-[#D3E0EA] bg-[#FBFDFC] text-sm text-nexora-ink outline-none transition placeholder:text-[#91A0AA] focus:border-nexora-emerald focus:bg-white focus:ring-2 focus:ring-nexora-emerald/10`}
          data-testid="search-input"
        />
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={imageSearch} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={imageLoading}
          title="Search with a photo"
          aria-label="Search with a photo"
          className={`absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-lg text-[#49677F] transition hover:bg-[#E8F1FB] hover:text-[#264A69] disabled:opacity-50 ${mobile ? "right-10 h-7 w-8" : "right-11 h-8 w-9"}`}
        >
          {imageLoading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#7E9AB0] border-t-transparent" /> : <Camera size={mobile ? 16 : 18} />}
        </button>
        <button type="submit" className={`absolute right-1.5 top-1/2 grid -translate-y-1/2 place-items-center rounded-lg bg-nexora-emerald text-white transition hover:bg-nexora-emeraldDark ${mobile ? "h-7 w-8" : "h-8 w-10"}`} aria-label="Search">
          <Search size={mobile ? 14 : 16} />
        </button>
      </form>

      {open && q.trim().length >= 2 && (
        <div className={`absolute left-0 right-0 top-[calc(100%+8px)] z-[95] overflow-hidden rounded-2xl border border-[#D6E3ED] bg-white text-left shadow-2xl ${mobile ? "max-h-[68vh]" : ""}`}>
          <div className="flex items-center gap-1 overflow-x-auto border-b border-[#E5EDF3] bg-gradient-to-r from-[#F6FAFD] via-white to-[#F2FAF6] p-2 no-scrollbar">
            {MODES.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setMode(key)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold transition ${mode === key ? "bg-nexora-emerald text-white" : "bg-white text-[#5F7180] hover:bg-[#E8F1FB]"}`}>{label}</button>
            ))}
            <span className="ml-auto hidden items-center gap-1 rounded-full bg-[#EAF2FB] px-2.5 py-1 text-[9px] font-bold text-[#315C89] sm:inline-flex"><Camera size={11} /> Photo search</span>
          </div>

          <div className="max-h-[430px] overflow-y-auto p-3">
            {understoodDifferently && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-[#D9E8F4] bg-[#F3F8FC] px-3 py-2">
                <span className="text-[11px] text-[#587187]">Nexora understood <b className="text-nexora-ink">“{q.trim()}”</b> as <b className="text-[#315C89]">“{canonical}”</b></span>
                <button type="button" onClick={() => setQ(canonical)} className="shrink-0 text-[10px] font-extrabold text-nexora-emerald">Use term</button>
              </div>
            )}

            {loading && <div className="flex items-center gap-2 px-2 py-5 text-sm text-nexora-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-nexora-emerald border-t-transparent" /> Finding the best matches…</div>}

            {!loading && (mode === "all" || mode === "products") && products.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between px-1"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-nexora-muted">Products</p><Link to={`/search?q=${encodeURIComponent(q.trim())}`} onClick={() => setOpen(false)} className="text-[10px] font-bold text-nexora-emerald">See all</Link></div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {products.slice(0, 6).map((product) => (
                    <Link key={product.id} to={`/product/${product.id}`} onClick={() => setOpen(false)} className="flex min-w-0 items-center gap-3 rounded-xl p-2 transition hover:bg-[#F1F8F5]">
                      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#EEF4F8]"><img src={resolveImage(product.images?.[0])} alt="" className="h-full w-full object-cover" /></span>
                      <span className="min-w-0 flex-1"><b className="block truncate text-sm text-nexora-ink">{product.title}</b><small className="block truncate text-[11px] text-nexora-muted">{product.shop_name} · {formatBDT(effectivePrice(product))}</small></span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {!loading && (mode === "all" || mode === "shops") && shops.length > 0 && (
              <section className={mode === "all" && products.length ? "mt-4 border-t border-[#E5EDF3] pt-3" : ""}>
                <div className="mb-2 flex items-center justify-between px-1"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-nexora-muted">Shops carrying this search</p><Link to={`/shops?q=${encodeURIComponent(q.trim())}`} onClick={() => setOpen(false)} className="text-[10px] font-bold text-nexora-emerald">See shops</Link></div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {shops.slice(0, 6).map((shop) => (
                    <Link key={shop.id || shop.slug} to={`/shop/${shop.slug}`} onClick={() => setOpen(false)} className="flex min-w-0 items-center gap-2 rounded-xl p-2 transition hover:bg-[#EAF2FB]">
                      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-nexora-emerald text-xs font-extrabold text-white">{shop.logo ? <img src={resolveImage(shop.logo)} alt="" className="h-full w-full object-cover" /> : <Store size={17} />}</span>
                      <span className="min-w-0"><b className="block truncate text-xs text-nexora-ink">{shop.name}</b><small className="block truncate text-[10px] text-nexora-muted">{shopSubtitle(shop)}</small></span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {!loading && (mode === "all" || mode === "brands") && brands.length > 0 && (
              <section className="mt-4 border-t border-[#E5EDF3] pt-3"><p className="mb-2 px-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-nexora-muted">Brands</p><div className="flex flex-wrap gap-2">{brands.slice(0, 6).map((brand) => <Link key={brand.name} to={`/products?brand=${encodeURIComponent(brand.name)}`} onClick={() => setOpen(false)} className="rounded-full bg-[#EAF2FB] px-3 py-1.5 text-xs font-bold text-[#315C89] hover:bg-[#DCEAF7]">{brand.name}</Link>)}</div></section>
            )}

            {!loading && mode === "all" && categories.length > 0 && (
              <section className="mt-4 border-t border-[#E5EDF3] pt-3"><p className="mb-2 px-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-nexora-muted">Categories</p><div className="flex flex-wrap gap-2">{categories.slice(0, 6).map((cat) => <Link key={cat.slug} to={`/category/${cat.slug}`} onClick={() => setOpen(false)} className="rounded-full bg-[#E8F6EF] px-3 py-1.5 text-xs font-bold text-nexora-emeraldDark">{cat.name}</Link>)}</div></section>
            )}

            {!loading && mode === "all" && searches.length > 0 && (
              <section className="mt-4 border-t border-[#E5EDF3] pt-3"><p className="mb-2 px-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-nexora-muted">Related ways people search</p><div className="flex flex-wrap gap-2">{searches.slice(0, 6).map((term) => <button key={term} type="button" onClick={() => { setQ(term); setOpen(true); }} className="inline-flex items-center gap-1 rounded-full border border-[#D6E3ED] bg-white px-3 py-1.5 text-xs font-semibold text-[#4D6477] hover:bg-[#F4F8FB]"><Tag size={11} /> {term}</button>)}</div></section>
            )}

            {!loading && !hasResults && (
              <div className="px-3 py-8 text-center">
                <Search className="mx-auto text-[#9CB1C4]" size={22} />
                <p className="mt-2 text-sm font-semibold text-nexora-ink">No instant match yet</p>
                <p className="mt-1 text-xs text-nexora-muted">We will still try spelling, synonym and fuzzy matching across the full catalogue.</p>
                <button type="button" onClick={submit} className="mt-3 inline-flex items-center gap-1 rounded-full bg-nexora-emerald px-4 py-2 text-xs font-bold text-white">Search marketplace</button>
              </div>
            )}

            <button type="button" onClick={() => fileRef.current?.click()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#BFD1DF] bg-[#F6FAFD] px-3 py-2.5 text-xs font-bold text-[#315C89] transition hover:bg-[#EAF2FB]"><Images size={16} /> Search similar products with a photo</button>
          </div>
        </div>
      )}
    </div>
  );
}