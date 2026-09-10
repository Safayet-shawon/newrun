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

const FALLBACK_HERO_IMAGES = [
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=500&q=85",
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=500&q=85",
  "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=500&q=85",
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=85",
  "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=500&q=85",
];

function SectionTitle({ title, subtitle, to, link = "See all" }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-nexora-ink sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-nexora-muted sm:text-sm">{subtitle}</p>}
      </div>
      {to && <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-nexora-emerald hover:text-nexora-emeraldDark">{link} <ArrowRight size={14} /></Link>}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.get("/home", { signal: controller.signal, timeout: 7000 })
      .then(({ data }) => setData(data))
      .catch((err) => { if (err.code !== "ERR_CANCELED") setError(true); });
    return () => controller.abort();
  }, []);

  const categoryCounts = useMemo(() => Object.fromEntries((data?.categories || []).map((cat) => [cat.slug, cat.product_count || 0])), [data]);
  const heroProducts = data?.trending?.slice(0, 5) || [];
  const heroImages = FALLBACK_HERO_IMAGES.map((fallback, index) => heroProducts[index]?.images?.[0] ? resolveImage(heroProducts[index].images[0]) : fallback);
  const featuredShops = data?.featured_shops?.slice(0, 3) || [];
  const trending = data?.trending?.slice(0, 6) || [];
  const topRated = data?.top_rated?.slice(0, 6) || [];
  const deals = data?.deals?.slice(0, 6) || [];

  const submitHeroSearch = (event) => {
    event.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="bg-nexora-warm">
      <div className="nx-container pt-3 sm:pt-4">
        <section className="overflow-hidden rounded-3xl border border-nexora-border bg-white shadow-sm">
          <div className="grid min-h-[238px] lg:grid-cols-[1.08fr_1fr_270px]">
            <div className="flex flex-col justify-center px-5 py-6 sm:px-7 lg:px-8">
              <span className="mb-2 inline-flex w-fit items-center rounded-full bg-nexora-mintbg px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-nexora-emeraldDark">
                Bangladesh's trusted multi-vendor marketplace
              </span>
              <h1 className="max-w-xl text-[34px] font-extrabold leading-[1.02] tracking-[-0.03em] text-nexora-ink sm:text-[42px] lg:text-[44px]">
                Everything you love.<br /><span className="text-nexora-emerald">From stores you can trust.</span>
              </h1>
              <p className="mt-2 text-sm text-nexora-muted">Great products. Genuine shops. A better everyday.</p>
              <form onSubmit={submitHeroSearch} className="mt-4 flex max-w-xl items-center rounded-xl border border-nexora-border bg-[#FBFDFC] p-1.5 md:hidden">
                <Search size={16} className="ml-2 text-nexora-muted" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Nexora..." className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" />
                <button className="rounded-lg bg-nexora-emerald px-3 py-2 text-xs font-bold text-white">Search</button>
              </form>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/products" className="nx-btn-primary">Explore Marketplace <ArrowRight size={15} /></Link>
                <Link to="/shops" className="nx-btn-ghost">Discover Shops</Link>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold text-nexora-muted">
                <span className="inline-flex items-center gap-1.5"><Truck size={15} className="text-nexora-emerald" /> Fast delivery</span>
                <span className="inline-flex items-center gap-1.5"><BadgeCheck size={15} className="text-nexora-emerald" /> Verified sellers</span>
                <span className="inline-flex items-center gap-1.5"><ShieldCheck size={15} className="text-nexora-emerald" /> Easy returns</span>
              </div>
            </div>

            <div className="relative hidden min-h-[238px] overflow-hidden bg-gradient-to-br from-[#F6FBF8] to-[#E9F8F1] sm:block">
              <div className="absolute inset-0 opacity-50" style={{ backgroundImage: "radial-gradient(circle at 30% 20%, #ffffff 0, transparent 35%), radial-gradient(circle at 80% 80%, #cdeede 0, transparent 40%)" }} />
              <div className="absolute inset-4 grid grid-cols-6 grid-rows-5 gap-2">
                <div className="col-span-3 row-span-4 overflow-hidden rounded-3xl bg-white shadow-sm"><img src={heroImages[0]} alt="Marketplace discovery" className="h-full w-full object-cover" /></div>
                <div className="col-span-3 row-span-2 overflow-hidden rounded-3xl bg-white shadow-sm"><img src={heroImages[1]} alt="Trending product" className="h-full w-full object-cover" /></div>
                <div className="col-span-2 row-span-2 overflow-hidden rounded-2xl bg-white shadow-sm"><img src={heroImages[2]} alt="Beauty discovery" className="h-full w-full object-cover" /></div>
                <div className="col-span-1 row-span-2 overflow-hidden rounded-2xl bg-white shadow-sm"><img src={heroImages[3]} alt="Accessory" className="h-full w-full object-cover" /></div>
                <div className="col-span-6 row-span-1 flex items-center justify-between rounded-2xl bg-white/90 px-4 text-xs font-bold text-nexora-ink shadow-sm backdrop-blur">
                  <span>Fashion · Tech · Beauty · Home · More</span><span className="text-nexora-emerald">One marketplace</span>
                </div>
              </div>
            </div>

            <div className="hidden gap-3 border-l border-nexora-border bg-[#FBFDFC] p-3 lg:grid lg:grid-rows-2">
              <Link to="/shops" className="group rounded-2xl border border-[#CDEFE2] bg-nexora-mintbg p-4 transition hover:-translate-y-0.5 hover:shadow-sm">
                <div className="flex items-start justify-between"><span><b className="block text-lg text-nexora-ink">New Shops</b><small className="text-nexora-muted">Explore independent stores</small></span><Store className="text-nexora-emerald" size={22} /></div>
                <div className="mt-4 flex -space-x-1">
                  {(featuredShops.length ? featuredShops : [{ name: "S" }, { name: "N" }, { name: "X" }, { name: "A" }]).slice(0, 4).map((shop, index) => (
                    <span key={shop.id || index} className="grid h-9 w-9 place-items-center rounded-xl border-2 border-nexora-mintbg bg-white text-xs font-extrabold text-nexora-emeraldDark">{shop.name?.[0] || "N"}</span>
                  ))}
                </div>
              </Link>
              <Link to="/products?sort=popular" className="group rounded-2xl border border-[#F7E7C1] bg-[#FFF8E8] p-4 transition hover:-translate-y-0.5 hover:shadow-sm">
                <div className="flex items-start justify-between"><span><b className="block text-lg text-nexora-ink">Trending Today</b><small className="text-nexora-muted">See what shoppers are buying</small></span><Flame className="text-nexora-coral" size={22} /></div>
                <div className="mt-3 flex gap-2">
                  {heroImages.slice(0, 4).map((src, index) => <span key={index} className="h-10 flex-1 overflow-hidden rounded-xl bg-white"><img src={src} alt="" className="h-full w-full object-cover" /></span>)}
                </div>
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-3xl border border-nexora-border bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4 overflow-x-auto no-scrollbar">
              <h2 className="shrink-0 text-xl font-extrabold text-nexora-ink">Shop by Category</h2>
              <div className="flex shrink-0 gap-1">
                {CATEGORY_TABS.map(([label, to], index) => <Link key={label} to={to} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${index === 0 ? "bg-nexora-mintbg text-nexora-emeraldDark" : "text-nexora-muted hover:bg-nexora-mintbg hover:text-nexora-emeraldDark"}`}>{label}</Link>)}
              </div>
            </div>
            <Link to="/products" className="hidden shrink-0 items-center gap-1 text-xs font-bold text-nexora-emerald sm:inline-flex">See all categories <ArrowRight size={13} /></Link>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {CATEGORY_CARDS.map((card) => {
              const qs = new URLSearchParams();
              if (card.slug) qs.set("category", card.slug);
              if (card.query) qs.set("q", card.query);
              return (
                <Link key={card.title} to={`/products?${qs.toString()}`} className="group min-w-[155px] flex-1 overflow-hidden rounded-2xl border border-nexora-border bg-white transition hover:-translate-y-0.5 hover:border-[#C9E6DA] hover:shadow-md sm:min-w-[175px]">
                  <div className="h-[105px] overflow-hidden bg-nexora-mintbg"><img src={card.image} alt={card.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></div>
                  <div className="p-3">
                    <b className="block text-sm text-nexora-ink">{card.title}</b>
                    <span className="mt-0.5 block text-[10px] text-nexora-muted">{categoryCounts[card.slug] ? `${categoryCounts[card.slug]} marketplace items` : "Discover products"}</span>
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-nexora-emerald">Shop now <ArrowRight size={11} /></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-4">
          <SectionTitle title="Shop by Intent" subtitle="Find what you need, even when you do not know the exact category." to="/products" />
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {INTENTS.map(({ label, text, icon: Icon, to, tone }) => (
              <Link key={label} to={to} className="flex min-w-[190px] flex-1 items-center gap-3 rounded-2xl border border-nexora-border bg-white px-3 py-3 transition hover:-translate-y-0.5 hover:shadow-sm">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${tone}`}><Icon size={18} /></span>
                <span className="min-w-0"><b className="block text-xs text-nexora-ink">{label}</b><small className="mt-0.5 block truncate text-[10px] text-nexora-muted">{text}</small></span>
              </Link>
            ))}
          </div>
        </section>

        {error && <div className="mt-5 rounded-2xl border border-[#F7D6C6] bg-[#FFF7F2] p-4 text-sm text-nexora-coral">Live marketplace data is temporarily unavailable. The discovery layout is still available.</div>}

        <section className="mt-7 grid gap-7 xl:grid-cols-[1.45fr_.75fr]">
          <div>
            <SectionTitle title="Trending Now" subtitle="Popular products from shops across Nexora." to="/products?sort=popular" />
            {trending.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6">
                {trending.map((product, index) => <ProductCard key={product.id} product={product} index={index} aspect="aspect-[4/3]" />)}
              </div>
            ) : <div className="rounded-2xl border border-dashed border-nexora-border bg-white p-8 text-center text-sm text-nexora-muted">Trending products will appear as the marketplace grows.</div>}
          </div>

          <div>
            <SectionTitle title="Shops You'll Love" subtitle="Independent stores worth discovering." to="/shops" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {featuredShops.length ? featuredShops.map((shop) => <ShopCard key={shop.id} shop={shop} />) : <div className="rounded-2xl border border-dashed border-nexora-border bg-white p-8 text-center text-sm text-nexora-muted">New shops will appear here.</div>}
            </div>
          </div>
        </section>

        {deals.length > 0 && (
          <section className="mt-8">
            <SectionTitle title="Best Deals" subtitle="Useful discounts without turning the marketplace into a cluttered sale board." to="/deals" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {deals.map((product, index) => <ProductCard key={product.id} product={product} index={index} aspect="aspect-[4/3]" />)}
            </div>
          </section>
        )}

        {topRated.length > 0 && (
          <section className="mt-8">
            <SectionTitle title="Top Rated Products" subtitle="Strong ratings from marketplace shoppers." to="/products?sort=rating" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {topRated.map((product, index) => <ProductCard key={product.id} product={product} index={index} aspect="aspect-[4/3]" />)}
            </div>
          </section>
        )}

        {(data?.brands || []).length > 0 && (
          <section className="mt-8 rounded-3xl border border-nexora-border bg-white p-5 shadow-sm">
            <SectionTitle title="Brands to Know" subtitle="Browse names already available across Nexora shops." />
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {data.brands.slice(0, 16).map((brand) => <Link key={brand} to={`/products?brand=${encodeURIComponent(brand)}`} className="shrink-0 rounded-full border border-nexora-border bg-[#FBFDFC] px-4 py-2 text-sm font-semibold text-nexora-ink hover:border-nexora-emerald hover:bg-nexora-mintbg hover:text-nexora-emeraldDark">{brand}</Link>)}
            </div>
          </section>
        )}

        <section className="my-8 overflow-hidden rounded-3xl border border-[#CDEFE2] bg-nexora-mintbg p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-nexora-emerald">Discover independent businesses</span>
              <h2 className="mt-2 text-3xl font-extrabold text-nexora-ink">Your shop can have its own identity inside Nexora.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-nexora-muted">Create a storefront, publish products, build followers and meet customers through one organized digital mall.</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2"><Link to="/seller/signup" className="nx-btn-primary"><Store size={16} /> Become a seller</Link><Link to="/shops" className="nx-btn-ghost">Explore shops</Link></div>
          </div>
        </section>
      </div>
    </div>
  );
}
