import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Percent,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  Truck,
} from "lucide-react";
import { api } from "@/lib/api";
import ProductCard from "@/components/marketplace/ProductCard";
import ShopCard from "@/components/marketplace/ShopCard";

const FALLBACK_CATEGORY_IMAGES = {
  fashion: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=700&q=85",
  beauty: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=700&q=85",
  electronics: "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=700&q=85",
  furniture: "https://images.unsplash.com/photo-1616137422495-1e9e46e2aa77?auto=format&fit=crop&w=700&q=85",
  grocery: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=700&q=85",
  jewellery: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=700&q=85",
  sports: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=700&q=85",
  books: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=700&q=85",
  pets: "https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=700&q=85",
};

const FALLBACK_CATEGORIES = [
  { name: "Fashion", slug: "fashion", image_url: FALLBACK_CATEGORY_IMAGES.fashion },
  { name: "Beauty", slug: "beauty", image_url: FALLBACK_CATEGORY_IMAGES.beauty },
  { name: "Electronics", slug: "electronics", image_url: FALLBACK_CATEGORY_IMAGES.electronics },
  { name: "Home & Living", slug: "furniture", image_url: FALLBACK_CATEGORY_IMAGES.furniture },
];

const CATEGORY_TABS = [
  ["For You", "/products"],
  ["Men", "/products?category=fashion&q=men"],
  ["Women", "/products?category=fashion&q=women"],
  ["Kids", "/products?category=fashion&q=kids"],
  ["Baby", "/products?category=fashion&q=baby"],
  ["Health & Beauty", "/category/beauty"],
];

const INTENTS = [
  { label: "Under ৳999", text: "Great finds, lower prices", icon: Tag, to: "/products?max_price=999&sort=price_low", tone: "bg-[#FFF1D8] text-[#A66700]" },
  { label: "Top Rated", text: "Customer favourites", icon: Star, to: "/products?sort=rating", tone: "bg-[#FFF1D8] text-[#A66700]" },
  { label: "New Arrivals", text: "Fresh on Nexora", icon: Sparkles, to: "/products?sort=newest", tone: "bg-[#EEE9FF] text-[#644CC5]" },
  { label: "Made in Bangladesh", text: "Discover local shops", icon: MapPin, to: "/shops", tone: "bg-[#E3F7EE] text-[#087B5B]" },
  { label: "Fast Delivery", text: "Find everyday essentials", icon: Truck, to: "/products", tone: "bg-[#E8F1FB] text-[#315C89]" },
  { label: "Best Deals", text: "More value everyday", icon: Percent, to: "/deals", tone: "bg-[#FFE8DE] text-nexora-coral" },
  { label: "Trending", text: "Popular right now", icon: TrendingUp, to: "/products?sort=popular", tone: "bg-[#E8F1FB] text-[#315C89]" },
];

const DEFAULT_FEATURED_GENDERS = [
  {
    title: "MEN",
    subtitle: "Everyday style, footwear & essentials",
    to: "/products?category=fashion&q=men",
    image: "https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=1100&q=88",
    tone: "from-[#BFE8EA]/25 via-[#F7FBFB]/5 to-[#0F766E]/25",
    accent: "bg-[#0F766E]",
  },
  {
    title: "WOMEN",
    subtitle: "Fashion, beauty & accessories",
    to: "/products?category=fashion&q=women",
    image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1100&q=88",
    tone: "from-[#FFD7E1]/35 via-[#FFF7F9]/5 to-[#E35D86]/25",
    accent: "bg-[#D94B78]",
  },
];

const DEFAULT_CAMPAIGNS = [
  {
    eyebrow: "FASHION WEEK",
    title: "Fresh looks from independent shops",
    text: "Discover new-season fashion, local labels and everyday essentials in one place.",
    cta: "Shop fashion",
    to: "/category/fashion",
    image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=88",
    bg: "from-[#DFF4EC] via-[#F5FCF9] to-[#E8F1FB]",
  },
  {
    eyebrow: "BEAUTY DAYS",
    title: "Glow-up picks, better prices",
    text: "Explore skincare, makeup and beauty favourites from marketplace sellers.",
    cta: "Explore beauty",
    to: "/category/beauty",
    image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1600&q=88",
    bg: "from-[#FFE9EF] via-[#FFF8FA] to-[#F0E9FF]",
  },
  {
    eyebrow: "TECH WEEKEND",
    title: "Popular tech, one marketplace",
    text: "Compare electronics and accessories from different shops without losing context.",
    cta: "Shop electronics",
    to: "/category/electronics",
    image: "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=1600&q=88",
    bg: "from-[#DCEBFA] via-[#F5F9FD] to-[#E9F7F1]",
  },
];

function SectionTitle({ title, subtitle, to, link = "See all" }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-extrabold tracking-tight text-nexora-ink sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-nexora-muted sm:text-sm">{subtitle}</p>}
      </div>
      {to && <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-nexora-emerald hover:text-nexora-emeraldDark">{link} <ArrowRight size={14} /></Link>}
    </div>
  );
}

function usePerPage(kind = "product") {
  const [perPage, setPerPage] = useState(kind === "shop" ? 1 : 2);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (kind === "shop") setPerPage(w >= 1280 ? 3 : w >= 768 ? 2 : 1);
      else setPerPage(w >= 1536 ? 6 : w >= 1280 ? 5 : w >= 1024 ? 4 : w >= 640 ? 3 : 2);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [kind]);
  return perPage;
}

function RailControls({ page, pages, onPage, onPrev, onNext }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      <button onClick={onPrev} className="grid h-8 w-8 place-items-center rounded-full border border-[#CBD9E7] bg-white text-[#365A7C] transition hover:bg-[#E8F1FB]" aria-label="Previous page"><ChevronLeft size={16} /></button>
      {Array.from({ length: pages }).map((_, index) => (
        <button key={index} onClick={() => onPage(index)} className={`min-w-8 rounded-full px-2 py-1 text-xs font-extrabold transition ${page === index ? "bg-nexora-emerald text-white" : "bg-white text-nexora-muted hover:bg-[#E8F1FB]"}`}>{index + 1}</button>
      ))}
      <button onClick={onNext} className="grid h-8 w-8 place-items-center rounded-full border border-[#CBD9E7] bg-white text-[#365A7C] transition hover:bg-[#E8F1FB]" aria-label="Next page"><ChevronRight size={16} /></button>
    </div>
  );
}

function ProductRail({ items, emptyText = "More products will appear here as sellers publish their catalogue." }) {
  const railRef = useRef(null);
  const perPage = usePerPage("product");
  const [page, setPage] = useState(0);
  const list = items || [];
  const pages = Math.max(1, Math.ceil(list.length / perPage));

  useEffect(() => { setPage((p) => Math.min(p, pages - 1)); }, [pages]);

  const go = (nextPage) => {
    const target = Math.max(0, Math.min(pages - 1, nextPage));
    setPage(target);
    railRef.current?.scrollTo({ left: railRef.current.clientWidth * target, behavior: "smooth" });
  };

  if (!list.length) return <div className="rounded-2xl border border-dashed border-nexora-border bg-white/80 px-5 py-8 text-sm text-nexora-muted">{emptyText}</div>;

  return <>
    <div ref={railRef} onScroll={(e) => setPage(Math.min(pages - 1, Math.max(0, Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))))} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 no-scrollbar touch-pan-x">
      {list.map((product, index) => <div key={product.id} className="shrink-0 snap-start" style={{ width: `calc((100% - ${(perPage - 1) * 12}px) / ${perPage})` }}><ProductCard product={product} index={index} /></div>)}
    </div>
    <RailControls page={page} pages={pages} onPage={go} onPrev={() => go(page - 1)} onNext={() => go(page + 1)} />
  </>;
}

function ShopRail({ shops }) {
  const railRef = useRef(null);
  const perPage = usePerPage("shop");
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil((shops?.length || 0) / perPage));
  const go = (nextPage) => {
    const target = Math.max(0, Math.min(pages - 1, nextPage));
    setPage(target);
    railRef.current?.scrollTo({ left: railRef.current.clientWidth * target, behavior: "smooth" });
  };
  if (!shops?.length) return <div className="rounded-2xl border border-dashed border-nexora-border bg-white/80 p-8 text-center text-sm text-nexora-muted">New shops will appear here.</div>;
  return <>
    <div ref={railRef} onScroll={(e) => setPage(Math.min(pages - 1, Math.max(0, Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))))} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 no-scrollbar touch-pan-x">
      {shops.map((shop) => <div key={shop.id} className="shrink-0 snap-start" style={{ width: `calc((100% - ${(perPage - 1) * 12}px) / ${perPage})` }}><ShopCard shop={shop} /></div>)}
    </div>
    <RailControls page={page} pages={pages} onPage={go} onPrev={() => go(page - 1)} onNext={() => go(page + 1)} />
  </>;
}

function CampaignCarousel({ campaigns }) {
  const list = campaigns || [];
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, list.length - 1))); }, [list.length]);
  useEffect(() => {
    if (paused || list.length <= 1) return undefined;
    const id = setInterval(() => setActive((a) => (a + 1) % list.length), 4800);
    return () => clearInterval(id);
  }, [paused, list.length]);

  if (!list.length) return null;
  const campaign = list[active] || list[0];
  const move = (dir) => setActive((a) => (a + dir + list.length) % list.length);

  return (
    <section className="mt-4" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className={`relative overflow-hidden rounded-3xl border border-[#D6E1EC] bg-gradient-to-r ${campaign.bg || "from-[#EAF2FB] via-white to-[#E8F7F0]"} shadow-sm`}>
        <div className="grid min-h-[190px] items-stretch md:grid-cols-[1fr_1.1fr]">
          <div className="relative z-10 flex flex-col justify-center p-5 sm:p-7 lg:p-8">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-nexora-emerald">{campaign.eyebrow}</span>
            <h2 className="mt-2 max-w-xl text-2xl font-extrabold text-nexora-ink sm:text-3xl">{campaign.title}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-nexora-muted">{campaign.text}</p>
            <Link to={campaign.to || "/products"} className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-nexora-emerald px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-nexora-emeraldDark">{campaign.cta || "Shop now"} <ArrowRight size={15} /></Link>
          </div>
          <Link to={campaign.to || "/products"} className="relative min-h-[170px] overflow-hidden md:min-h-[190px]">
            {campaign.image ? <img src={campaign.image} alt={campaign.title} className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-gradient-to-br from-[#E8F7F0] to-[#EAF2FB]" />}
            <div className="absolute inset-0 bg-gradient-to-r from-white/35 via-transparent to-transparent" />
          </Link>
        </div>
        {list.length > 1 && <><button onClick={() => move(-1)} className="absolute left-3 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-nexora-ink shadow-md backdrop-blur sm:grid" aria-label="Previous campaign"><ArrowLeft size={17} /></button><button onClick={() => move(1)} className="absolute right-3 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-nexora-ink shadow-md backdrop-blur sm:grid" aria-label="Next campaign"><ArrowRight size={17} /></button></>}
      </div>
      {list.length > 1 && <div className="mt-2 flex items-center justify-center gap-2">{list.map((item, index) => <button key={`${item.title}-${index}`} onClick={() => setActive(index)} className={`h-2 rounded-full transition-all ${index === active ? "w-8 bg-nexora-emerald" : "w-2 bg-[#C9D7E5]"}`} aria-label={`Show campaign ${index + 1}`} />)}</div>}
    </section>
  );
}

function uniqueProducts(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function uniqueShops(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = item?.id || item?.slug;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function Home() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [siteContent, setSiteContent] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(false);
  const [popularPool, setPopularPool] = useState([]);
  const [ratingPool, setRatingPool] = useState([]);
  const [shopPool, setShopPool] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      api.get("/home", { signal: controller.signal, timeout: 7000 }),
      api.get("/products", { signal: controller.signal, timeout: 7000, params: { sort: "popular", limit: 48 } }),
      api.get("/products", { signal: controller.signal, timeout: 7000, params: { sort: "rating", limit: 48 } }),
      api.get("/shops", { signal: controller.signal, timeout: 7000, params: { limit: 12 } }),
      api.get("/site-content", { signal: controller.signal, timeout: 7000 }),
    ]).then(([homeResult, popularResult, ratingResult, shopsResult, contentResult]) => {
      if (homeResult.status === "fulfilled") setData(homeResult.value.data);
      else if (homeResult.reason?.code !== "ERR_CANCELED") setError(true);
      if (popularResult.status === "fulfilled") setPopularPool(popularResult.value.data?.items || []);
      if (ratingResult.status === "fulfilled") setRatingPool(ratingResult.value.data?.items || []);
      if (shopsResult.status === "fulfilled") setShopPool(shopsResult.value.data || []);
      if (contentResult.status === "fulfilled") setSiteContent(contentResult.value.data || null);
    });
    return () => controller.abort();
  }, []);

  const categoryCounts = useMemo(() => Object.fromEntries((data?.categories || []).map((cat) => [cat.slug, cat.product_count || 0])), [data]);
  const categoryCards = useMemo(() => {
    const live = data?.categories || [];
    const source = live.length ? live : FALLBACK_CATEGORIES;
    return source.slice(0, 12).map((cat) => ({
      title: cat.name || cat.title || cat.slug,
      slug: cat.slug,
      image: cat.image_url || cat.image || FALLBACK_CATEGORY_IMAGES[cat.slug] || FALLBACK_CATEGORY_IMAGES.fashion,
    }));
  }, [data]);
  const trending = useMemo(() => uniqueProducts([...(data?.trending || []), ...popularPool]).slice(0, 24), [data, popularPool]);
  const deals = useMemo(() => uniqueProducts([...(data?.deals || []), ...popularPool.filter((p) => p.discount_price != null)]).slice(0, 24), [data, popularPool]);
  const topRated = useMemo(() => uniqueProducts([...(data?.top_rated || []), ...ratingPool]).slice(0, 24), [data, ratingPool]);
  const featuredShops = useMemo(() => uniqueShops([...(data?.featured_shops || []), ...shopPool]).slice(0, 12), [data, shopPool]);
  const brands = useMemo(() => {
    const live = (data?.brands || []).map((brand) => typeof brand === "string" ? brand : brand?.name).filter(Boolean);
    const inferred = [...trending, ...topRated].map((p) => p.brand).filter(Boolean);
    return [...new Set([...live, ...inferred])].slice(0, 18);
  }, [data, trending, topRated]);

  const featuredGenders = siteContent?.featured_genders?.length ? siteContent.featured_genders : DEFAULT_FEATURED_GENDERS;
  const campaigns = siteContent ? (siteContent.campaigns || []) : DEFAULT_CAMPAIGNS;
  const heroBadge = siteContent?.hero_badge || "Bangladesh's trusted multi-vendor marketplace";
  const heroLine1 = siteContent?.hero_line1 || "Everything you love.";
  const heroLine2 = siteContent?.hero_line2 || "From stores you can trust.";
  const heroSubtitle = siteContent?.hero_subtitle || "Great products. Genuine shops. A better everyday.";

  const submitHeroSearch = (event) => {
    event.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="overflow-x-hidden bg-[#F4F8FB]">
      <div className="nx-container pt-2 sm:pt-4">
        <section className="overflow-hidden rounded-2xl border border-[#DCE7EF] bg-white shadow-sm sm:rounded-3xl">
          <div className="grid lg:grid-cols-[.88fr_1.12fr]">
            <div className="flex flex-col justify-center px-4 py-5 sm:px-7 sm:py-6 lg:px-8">
              <span className="mb-2 inline-flex w-fit items-center rounded-full bg-[#E7F6EF] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-nexora-emeraldDark sm:text-[10px]">{heroBadge}</span>
              <h1 className="max-w-xl text-[30px] font-extrabold leading-[1.03] tracking-[-0.03em] text-nexora-ink sm:text-[42px] lg:text-[44px]">{heroLine1}<br /><span className="text-nexora-emerald">{heroLine2}</span></h1>
              <p className="mt-2 text-sm text-nexora-muted">{heroSubtitle}</p>
              <form onSubmit={submitHeroSearch} className="mt-3 flex max-w-xl items-center rounded-xl border border-[#D9E5EE] bg-[#F8FBFD] p-1.5 md:hidden">
                <Search size={16} className="ml-2 shrink-0 text-nexora-muted" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products, shops or brands..." className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" />
                <button className="rounded-lg bg-nexora-emerald px-3 py-2 text-xs font-bold text-white">Search</button>
              </form>
              <div className="mt-3 flex flex-wrap gap-2"><Link to="/products" className="nx-btn-primary">Explore Marketplace <ArrowRight size={15} /></Link><Link to="/shops" className="nx-btn-ghost">Discover Shops</Link></div>
              <div className="-mx-1 mt-3 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#D7EEE4] bg-[#F4FBF7] px-3 py-1.5 text-[10px] font-semibold text-nexora-muted"><Truck size={14} className="text-nexora-emerald" /> Fast delivery</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#D7EEE4] bg-[#F4FBF7] px-3 py-1.5 text-[10px] font-semibold text-nexora-muted"><BadgeCheck size={14} className="text-nexora-emerald" /> Verified sellers</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#D7EEE4] bg-[#F4FBF7] px-3 py-1.5 text-[10px] font-semibold text-nexora-muted"><ShieldCheck size={14} className="text-nexora-emerald" /> Easy returns</span>
              </div>
            </div>

            <div className="border-t border-[#DCE7EF] bg-gradient-to-br from-[#EAF2FB] via-[#F7FBFE] to-[#EEF8F3] p-3 sm:p-4 lg:border-l lg:border-t-0">
              <div className={`grid gap-3 ${featuredGenders.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                {featuredGenders.map((item, index) => (
                  <Link key={`${item.title}-${index}`} to={item.to || "/products"} className="group relative min-h-[180px] overflow-hidden rounded-2xl bg-white shadow-sm sm:min-h-[238px] sm:rounded-3xl">
                    {item.image ? <img src={item.image} alt={`${item.title} collection`} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" /> : <div className="absolute inset-0 bg-gradient-to-br from-[#E8F7F0] to-[#EAF2FB]" />}
                    <div className={`absolute inset-0 bg-gradient-to-t ${item.tone || "from-[#0F766E]/25 via-transparent to-transparent"}`} />
                    <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/92 p-3 shadow-sm backdrop-blur sm:inset-x-4 sm:bottom-4 sm:p-4">
                      <div className="flex items-center justify-between gap-2"><div><span className="text-[9px] font-black tracking-[0.22em] text-nexora-muted">SIGNATURE</span><h2 className="text-xl font-black tracking-tight text-nexora-ink sm:text-2xl">{item.title}</h2></div><span className={`grid h-9 w-9 place-items-center rounded-full text-white ${item.accent || "bg-[#0F766E]"}`}><ArrowRight size={16} /></span></div>
                      <p className="mt-1 hidden text-[11px] text-nexora-muted sm:block">{item.subtitle}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-3xl border border-[#DCE7EF] bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4 overflow-x-auto no-scrollbar"><h2 className="shrink-0 text-xl font-extrabold text-nexora-ink">Shop by Category</h2><div className="flex shrink-0 gap-1">{CATEGORY_TABS.map(([label, to], index) => <Link key={label} to={to} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${index === 0 ? "bg-[#E8F5EF] text-nexora-emeraldDark" : "text-nexora-muted hover:bg-[#E8F1FB] hover:text-[#315C89]"}`}>{label}</Link>)}</div></div>
            <Link to="/products" className="hidden shrink-0 items-center gap-1 text-xs font-bold text-nexora-emerald sm:inline-flex">See all categories <ArrowRight size={13} /></Link>
          </div>
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 no-scrollbar touch-pan-x">
            {categoryCards.map((card) => <Link key={card.slug} to={`/category/${card.slug}`} className="group min-w-[145px] snap-start overflow-hidden rounded-2xl border border-[#DCE7EF] bg-white transition hover:-translate-y-0.5 hover:border-[#B9D7C9] hover:shadow-md sm:min-w-[175px]"><div className="h-[100px] overflow-hidden bg-nexora-mintbg sm:h-[110px]"><img src={card.image} alt={card.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></div><div className="p-3"><b className="block text-sm text-nexora-ink">{card.title}</b><span className="mt-1 block text-[11px] text-nexora-muted">{categoryCounts[card.slug] ? `${categoryCounts[card.slug]}+ products` : "Explore products"}</span></div></Link>)}
          </div>
        </section>

        <section className="mt-4 rounded-3xl border border-[#D4E2EF] bg-[#EAF2FB] p-4 shadow-sm sm:p-5">
          <SectionTitle title="Brands to Know" subtitle="Popular names available across Nexora shops" to="/products" />
          {brands.length ? <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 no-scrollbar touch-pan-x">{brands.map((brand) => <Link key={brand} to={`/products?brand=${encodeURIComponent(brand)}`} className="min-w-[132px] snap-start rounded-2xl border border-white/80 bg-white/90 px-5 py-4 text-center text-sm font-extrabold text-[#284B6B] shadow-sm transition hover:-translate-y-0.5 hover:border-[#9DBBD4] hover:bg-white">{brand}</Link>)}</div> : <div className="rounded-2xl border border-dashed border-[#BCD0E2] bg-white/65 p-5 text-sm text-[#55718B]">Brand names will appear automatically as sellers publish branded products.</div>}
        </section>

        <CampaignCarousel campaigns={campaigns} />

        <section className="mt-5 rounded-3xl border border-[#E2DCEF] bg-[#F6F2FB] p-4 sm:p-5"><SectionTitle title="Shop by Intent" subtitle="Find what you want without digging through menus" /><div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 no-scrollbar touch-pan-x">{INTENTS.map(({ label, text, icon: Icon, to, tone }) => <Link key={label} to={to} className="flex min-w-[190px] snap-start items-center gap-3 rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={18} /></span><span className="min-w-0"><b className="block truncate text-xs text-nexora-ink">{label}</b><small className="mt-0.5 block truncate text-[10px] text-nexora-muted">{text}</small></span></Link>)}</div></section>

        {error && <div className="mt-4 rounded-2xl border border-[#F6D5C9] bg-[#FFF7F3] px-4 py-3 text-sm text-nexora-coral">Some live marketplace sections could not load. You can still browse the catalogue.</div>}

        <section className="mt-6 rounded-3xl border border-[#D5E4F1] bg-[#F7FBFE] p-4 sm:p-5"><SectionTitle title="Trending Now" subtitle="Swipe, drag or use the page controls to keep browsing" to="/products?sort=popular" /><ProductRail items={trending} emptyText="Trending products will appear as the marketplace grows." /></section>
        <section className="mt-6 rounded-3xl border border-[#D6EBDD] bg-[#EFF9F3] p-4 sm:p-5"><SectionTitle title="Shops You’ll Love" subtitle="Independent stores worth discovering" to="/shops" /><ShopRail shops={featuredShops} /></section>
        <section className="mt-6 rounded-3xl border border-[#F2DEC9] bg-[#FFF8ED] p-4 sm:p-5"><SectionTitle title="Best Deals" subtitle="More products, less dead space — browse page by page" to="/deals" /><ProductRail items={deals} emptyText="Active deals will appear here when sellers add discounts." /></section>
        <section className="mt-6 rounded-3xl border border-[#DED8EF] bg-[#F8F5FD] p-4 sm:p-5"><SectionTitle title="Top Rated" subtitle="Customer favourites across the marketplace" to="/products?sort=rating" /><ProductRail items={topRated} emptyText="Top-rated products will appear once more shoppers leave reviews." /></section>

        <section className="my-8 grid gap-5 overflow-hidden rounded-3xl border border-[#CDEFE2] bg-gradient-to-r from-[#E9F8F1] via-[#F7FCF9] to-[#EAF2FB] p-6 shadow-sm sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center"><div><span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-nexora-emerald">Build with Nexora</span><h2 className="mt-1 text-2xl font-extrabold text-nexora-ink sm:text-3xl">Your shop. Your identity. One trusted marketplace.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-nexora-muted">Create a storefront, publish products and reach shoppers across Bangladesh without losing your own brand identity.</p></div><div className="flex flex-wrap gap-2"><Link to="/seller/signup" className="nx-btn-primary">Become a Seller <ArrowRight size={15} /></Link><Link to="/shops" className="nx-btn-ghost">Discover Shops</Link></div></section>
      </div>
    </div>
  );
}
