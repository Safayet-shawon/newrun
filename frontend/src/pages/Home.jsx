import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Flame,
  MapPin,
  Percent,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Tag,
  TrendingUp,
  Truck,
} from "lucide-react";
import { api, resolveImage } from "@/lib/api";
import ProductCard from "@/components/marketplace/ProductCard";
import ShopCard from "@/components/marketplace/ShopCard";

const CATEGORY_CARDS = [
  { title: "Women Fashion", slug: "fashion", query: "women", image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=700&q=85" },
  { title: "Men Footwear", slug: "fashion", query: "men shoes", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=85" },
  { title: "Beauty & Skincare", slug: "beauty", image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=700&q=85" },
  { title: "Kids Clothing", slug: "fashion", query: "kids", image: "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=700&q=85" },
  { title: "Baby Accessories", slug: "fashion", query: "baby", image: "https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=700&q=85" },
  { title: "Home & Living", slug: "furniture", image: "https://images.unsplash.com/photo-1616137422495-1e9e46e2aa77?auto=format&fit=crop&w=700&q=85" },
  { title: "Electronics", slug: "electronics", image: "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=700&q=85" },
  { title: "Bags & Accessories", slug: "fashion", query: "bag", image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=700&q=85" },
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
  { label: "Under ৳999", text: "Great finds, lower prices", icon: Tag, to: "/products?max_price=999&sort=price_low", tone: "bg-[#FFF7E1] text-[#B77900]" },
  { label: "Top Rated", text: "Customer favourites", icon: Star, to: "/products?sort=rating", tone: "bg-[#FFF7E1] text-[#B77900]" },
  { label: "New Arrivals", text: "Fresh on Nexora", icon: Sparkles, to: "/products?sort=newest", tone: "bg-[#F3EFFF] text-[#7052D8]" },
  { label: "Made in Bangladesh", text: "Discover local shops", icon: MapPin, to: "/shops", tone: "bg-nexora-mintbg text-nexora-emerald" },
  { label: "Fast Delivery", text: "Find everyday essentials", icon: Truck, to: "/products", tone: "bg-nexora-mintbg text-nexora-emerald" },
  { label: "Best Deals", text: "More value everyday", icon: Percent, to: "/deals", tone: "bg-[#FFF0EA] text-nexora-coral" },
  { label: "Trending", text: "Popular right now", icon: TrendingUp, to: "/products?sort=popular", tone: "bg-[#F3EFFF] text-[#7052D8]" },
];

const FALLBACK_HERO = [
  { image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=500&q=85", to: "/products?category=fashion&q=shoes", label: "Fashion" },
  { image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=500&q=85", to: "/category/electronics", label: "Tech" },
  { image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=500&q=85", to: "/category/beauty", label: "Beauty" },
  { image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=85", to: "/products?q=accessories", label: "Accessories" },
  { image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=500&q=85", to: "/products?category=fashion&q=bag", label: "Bags" },
];

const MEN_TERMS = ["men", "mens", "male", "panjabi", "punjabi", "shirt", "polo", "trouser", "jeans", "wallet", "loafer", "sneaker"];
const WOMEN_TERMS = ["women", "womens", "female", "ladies", "saree", "salwar", "kurti", "dress", "abaya", "hijab", "handbag", "makeup"];

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

function ProductGrid({ items, limit = 12 }) {
  if (!items?.length) return <div className="rounded-2xl border border-dashed border-nexora-border bg-white px-5 py-8 text-sm text-nexora-muted">More products will appear here as sellers publish their catalogue.</div>;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{items.slice(0, limit).map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div>;
}

function matchesAny(product, terms) {
  const text = `${product?.title || ""} ${product?.category || ""} ${product?.brand || ""} ${(product?.tags || []).join(" ")}`.toLowerCase();
  return terms.some((term) => text.includes(term));
}

function uniqueProducts(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export default function Home() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(false);
  const [fashionPool, setFashionPool] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      api.get("/home", { signal: controller.signal, timeout: 7000 }),
      api.get("/products", { signal: controller.signal, timeout: 7000, params: { category: "fashion", sort: "popular", limit: 60 } }),
    ]).then(([homeResult, fashionResult]) => {
      if (homeResult.status === "fulfilled") setData(homeResult.value.data);
      else if (homeResult.reason?.code !== "ERR_CANCELED") setError(true);
      if (fashionResult.status === "fulfilled") setFashionPool(fashionResult.value.data?.items || []);
    });
    return () => controller.abort();
  }, []);

  const categoryCounts = useMemo(() => Object.fromEntries((data?.categories || []).map((cat) => [cat.slug, cat.product_count || 0])), [data]);
  const heroProducts = data?.trending?.slice(0, 5) || [];
  const heroTiles = FALLBACK_HERO.map((fallback, index) => ({
    image: heroProducts[index]?.images?.[0] ? resolveImage(heroProducts[index].images[0]) : fallback.image,
    to: heroProducts[index]?.id ? `/product/${heroProducts[index].id}` : fallback.to,
    label: heroProducts[index]?.title || fallback.label,
  }));
  const featuredShops = data?.featured_shops?.slice(0, 3) || [];
  const trending = data?.trending?.slice(0, 6) || [];
  const topRated = data?.top_rated?.slice(0, 12) || [];
  const deals = data?.deals?.slice(0, 12) || [];

  const fallbackPool = useMemo(() => uniqueProducts([...(data?.trending || []), ...(data?.top_rated || []), ...(data?.deals || []), ...fashionPool]), [data, fashionPool]);
  const mensPicks = useMemo(() => {
    const matched = fashionPool.filter((p) => matchesAny(p, MEN_TERMS) && !matchesAny(p, WOMEN_TERMS));
    return uniqueProducts([...matched, ...fashionPool, ...fallbackPool]).slice(0, 12);
  }, [fashionPool, fallbackPool]);
  const womensPicks = useMemo(() => {
    const matched = fashionPool.filter((p) => matchesAny(p, WOMEN_TERMS));
    const menIds = new Set(mensPicks.map((p) => p.id));
    const nonMenFallback = [...fashionPool, ...fallbackPool].filter((p) => !menIds.has(p.id));
    return uniqueProducts([...matched, ...nonMenFallback, ...fallbackPool]).slice(0, 12);
  }, [fashionPool, fallbackPool, mensPicks]);

  const submitHeroSearch = (event) => {
    event.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="overflow-x-hidden bg-nexora-warm">
      <div className="nx-container pt-2 sm:pt-4">
        <section className="overflow-hidden rounded-2xl border border-nexora-border bg-white shadow-sm sm:rounded-3xl">
          <div className="grid min-h-[218px] lg:grid-cols-[1.08fr_1fr_270px] lg:min-h-[238px]">
            <div className="flex flex-col justify-center px-4 py-5 sm:px-7 sm:py-6 lg:px-8">
              <span className="mb-2 inline-flex w-fit items-center rounded-full bg-nexora-mintbg px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-nexora-emeraldDark sm:text-[10px]">Bangladesh&apos;s trusted multi-vendor marketplace</span>
              <h1 className="max-w-xl text-[30px] font-extrabold leading-[1.03] tracking-[-0.03em] text-nexora-ink sm:text-[42px] lg:text-[44px]">Everything you love.<br /><span className="text-nexora-emerald">From stores you can trust.</span></h1>
              <p className="mt-2 text-sm text-nexora-muted">Great products. Genuine shops. A better everyday.</p>
              <form onSubmit={submitHeroSearch} className="mt-3 flex max-w-xl items-center rounded-xl border border-nexora-border bg-[#FBFDFC] p-1.5 md:hidden">
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

            <div className="relative hidden min-h-[218px] overflow-hidden bg-gradient-to-br from-[#F6FBF8] to-[#E9F8F1] sm:block lg:min-h-[238px]">
              <div className="absolute inset-0 opacity-50" style={{ backgroundImage: "radial-gradient(circle at 30% 20%, #ffffff 0, transparent 35%), radial-gradient(circle at 80% 80%, #cdeede 0, transparent 40%)" }} />
              <div className="absolute inset-3 grid grid-cols-6 grid-rows-5 gap-2 sm:inset-4">
                <Link to={heroTiles[0].to} aria-label={`Shop ${heroTiles[0].label}`} className="group col-span-3 row-span-4 overflow-hidden rounded-2xl bg-white shadow-sm sm:rounded-3xl"><img src={heroTiles[0].image} alt={heroTiles[0].label} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></Link>
                <Link to={heroTiles[1].to} aria-label={`Shop ${heroTiles[1].label}`} className="group col-span-3 row-span-2 overflow-hidden rounded-2xl bg-white shadow-sm sm:rounded-3xl"><img src={heroTiles[1].image} alt={heroTiles[1].label} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></Link>
                <Link to={heroTiles[2].to} aria-label={`Shop ${heroTiles[2].label}`} className="group col-span-2 row-span-2 overflow-hidden rounded-2xl bg-white shadow-sm"><img src={heroTiles[2].image} alt={heroTiles[2].label} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></Link>
                <Link to={heroTiles[3].to} aria-label={`Shop ${heroTiles[3].label}`} className="group col-span-1 row-span-2 overflow-hidden rounded-2xl bg-white shadow-sm"><img src={heroTiles[3].image} alt={heroTiles[3].label} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></Link>
                <div className="col-span-6 row-span-1 flex items-center justify-between rounded-2xl bg-white/90 px-3 text-[10px] font-bold text-nexora-ink shadow-sm backdrop-blur sm:px-4 sm:text-xs"><span>Fashion · Tech · Beauty · Home · More</span><Link to="/products" className="shrink-0 text-nexora-emerald hover:text-nexora-emeraldDark">One marketplace →</Link></div>
              </div>
            </div>

            <div className="hidden gap-3 border-l border-nexora-border bg-[#FBFDFC] p-3 lg:grid lg:grid-rows-2">
              <Link to="/shops" className="group rounded-2xl border border-[#CDEFE2] bg-nexora-mintbg p-4 transition hover:-translate-y-0.5 hover:shadow-sm"><div className="flex items-start justify-between"><span><b className="block text-lg text-nexora-ink">New Shops</b><small className="text-nexora-muted">Explore independent stores</small></span><Store className="text-nexora-emerald" size={22} /></div><div className="mt-4 flex -space-x-1">{(featuredShops.length ? featuredShops : [{ name: "S" }, { name: "N" }, { name: "X" }, { name: "A" }]).slice(0, 4).map((shop, index) => <span key={shop.id || index} className="grid h-9 w-9 place-items-center rounded-xl border-2 border-nexora-mintbg bg-white text-xs font-extrabold text-nexora-emeraldDark">{shop.name?.[0] || "N"}</span>)}</div></Link>
              <Link to="/products?sort=popular" className="group rounded-2xl border border-[#F7E7C1] bg-[#FFF8E8] p-4 transition hover:-translate-y-0.5 hover:shadow-sm"><div className="flex items-start justify-between"><span><b className="block text-lg text-nexora-ink">Trending Today</b><small className="text-nexora-muted">See what shoppers are buying</small></span><Flame className="text-nexora-coral" size={22} /></div><div className="mt-3 flex gap-2">{heroTiles.slice(0, 4).map((tile, index) => <Link to={tile.to} key={index} className="h-10 flex-1 overflow-hidden rounded-xl bg-white"><img src={tile.image} alt={tile.label} className="h-full w-full object-cover" /></Link>)}</div></Link>
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-nexora-border bg-white p-3 shadow-sm sm:mt-4 sm:rounded-3xl sm:p-5">
          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 items-center gap-3 overflow-x-auto no-scrollbar sm:gap-4"><h2 className="shrink-0 text-lg font-extrabold text-nexora-ink sm:text-xl">Shop by Category</h2><div className="flex shrink-0 gap-1">{CATEGORY_TABS.map(([label, to], index) => <Link key={label} to={to} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${index === 0 ? "bg-nexora-mintbg text-nexora-emeraldDark" : "text-nexora-muted hover:bg-nexora-mintbg hover:text-nexora-emeraldDark"}`}>{label}</Link>)}</div></div><Link to="/products" className="hidden shrink-0 items-center gap-1 text-xs font-bold text-nexora-emerald sm:inline-flex">See all categories <ArrowRight size={13} /></Link></div>
          <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 no-scrollbar sm:gap-3">{CATEGORY_CARDS.map((card) => { const qs = new URLSearchParams(); if (card.slug) qs.set("category", card.slug); if (card.query) qs.set("q", card.query); return <Link key={card.title} to={`/products?${qs.toString()}`} className="group min-w-[145px] snap-start overflow-hidden rounded-2xl border border-nexora-border bg-white transition hover:-translate-y-0.5 hover:border-[#C9E6DA] hover:shadow-md sm:min-w-[175px] sm:flex-1"><div className="h-[92px] overflow-hidden bg-nexora-mintbg sm:h-[105px]"><img src={card.image} alt={card.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></div><div className="p-2.5 sm:p-3"><b className="block text-xs text-nexora-ink sm:text-sm">{card.title}</b><span className="mt-1 block text-[10px] text-nexora-muted sm:text-[11px]">{categoryCounts[card.slug] ? `${categoryCounts[card.slug]}+ products` : "Explore products"}</span><span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-nexora-emerald sm:text-[11px]">Shop now <ArrowRight size={11} /></span></div></Link>; })}</div>
        </section>

        <section className="mt-4"><SectionTitle title="Shop by Intent" subtitle="Find exactly what you need" /><div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 no-scrollbar lg:grid lg:grid-cols-7 lg:overflow-visible">{INTENTS.map(({ label, text, icon: Icon, to, tone }) => <Link key={label} to={to} className="flex min-w-[180px] snap-start items-center gap-3 rounded-2xl border border-nexora-border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md lg:min-w-0"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={18} /></span><span className="min-w-0"><b className="block truncate text-xs text-nexora-ink">{label}</b><small className="mt-0.5 block truncate text-[10px] text-nexora-muted">{text}</small></span></Link>)}</div></section>

        {error && <div className="mt-4 rounded-2xl border border-[#F6D5C9] bg-[#FFF7F3] px-4 py-3 text-sm text-nexora-coral">Some live marketplace sections could not load. You can still browse the catalogue.</div>}

        <section className="mt-6">
          <SectionTitle title="Trending Now" subtitle="Most-loved products from shops across Nexora" to="/products?sort=popular" />
          {trending.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{trending.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div> : <div className="rounded-2xl border border-dashed border-nexora-border bg-white p-8 text-center text-sm text-nexora-muted">Trending products will appear as the marketplace grows.</div>}
        </section>

        <section className="mt-6 rounded-2xl border border-[#D7EEE4] bg-[#F4FBF7] p-3 sm:mt-8 sm:rounded-3xl sm:p-6"><SectionTitle title="Men’s Picks" subtitle="Two rows of fashion, footwear and everyday favourites" to="/products?category=fashion&q=men" link="Shop men" /><ProductGrid items={mensPicks} limit={12} /></section>
        <section className="mt-5 rounded-2xl border border-[#F2DED5] bg-[#FFF9F6] p-3 sm:mt-6 sm:rounded-3xl sm:p-6"><SectionTitle title="Women’s Picks" subtitle="Two rows of fashion, beauty and accessories to explore" to="/products?category=fashion&q=women" link="Shop women" /><ProductGrid items={womensPicks} limit={12} /></section>

        <section className="mt-6 sm:mt-8">
          <SectionTitle title="Shops You’ll Love" subtitle="Independent stores worth discovering" to="/shops" />
          {featuredShops.length ? <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 no-scrollbar lg:grid lg:grid-cols-3 lg:overflow-visible">{featuredShops.map((shop) => <div key={shop.id} className="min-w-[82vw] snap-start sm:min-w-[360px] lg:min-w-0"><ShopCard shop={shop} /></div>)}</div> : <div className="rounded-2xl border border-dashed border-nexora-border bg-white p-8 text-center text-sm text-nexora-muted">New shops will appear here.</div>}
        </section>

        <section className="mt-8"><SectionTitle title="Best Deals" subtitle="Good finds with active discounts" to="/deals" /><ProductGrid items={deals} limit={12} /></section>
        <section className="mt-8"><SectionTitle title="Top Rated" subtitle="Products shoppers rate highly" to="/products?sort=rating" /><ProductGrid items={topRated} limit={12} /></section>

        {!!data?.brands?.length && <section className="mt-8 rounded-2xl border border-nexora-border bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5"><SectionTitle title="Brands to Know" subtitle="Discover brands available across Nexora" to="/products" /><div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">{data.brands.slice(0, 14).map((brand, index) => { const name = typeof brand === "string" ? brand : brand.name; return <Link key={`${name}-${index}`} to={`/products?brand=${encodeURIComponent(name)}`} className="min-w-[130px] rounded-2xl border border-nexora-border bg-[#FBFDFC] px-4 py-3 text-center text-sm font-extrabold text-nexora-ink transition hover:border-nexora-emerald hover:text-nexora-emerald sm:min-w-[140px] sm:px-5 sm:py-4">{name}</Link>; })}</div></section>}

        <section className="my-7 grid gap-5 overflow-hidden rounded-2xl border border-[#CDEFE2] bg-gradient-to-r from-[#E9F8F1] via-[#F7FCF9] to-[#FFF7E8] p-5 sm:my-8 sm:rounded-3xl sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center"><div><span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-nexora-emerald sm:text-[11px]">Build with Nexora</span><h2 className="mt-1 text-2xl font-extrabold text-nexora-ink sm:text-3xl">Your shop. Your identity. One trusted marketplace.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-nexora-muted">Create a storefront, publish products and reach shoppers across Bangladesh without losing your own brand identity.</p></div><div className="flex flex-wrap gap-2"><Link to="/seller/signup" className="nx-btn-primary">Become a Seller <ArrowRight size={15} /></Link><Link to="/shops" className="nx-btn-ghost">Discover Shops</Link></div></section>
      </div>
    </div>
  );
}
