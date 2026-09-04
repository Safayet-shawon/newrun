import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Truck, Store, Sparkles, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { Loader, SectionHeader, Badge } from "@/components/shared/Bits";
import ProductCard from "@/components/marketplace/ProductCard";
import ShopCard from "@/components/marketplace/ShopCard";

const CAT_ICON_IMG = {
  fashion: "https://images.unsplash.com/photo-1613915617430-8ab0fd7c6baf?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
  food: "https://images.unsplash.com/photo-1547398847-19d7560a6257?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
  electronics: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
  beauty: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
  furniture: "https://images.unsplash.com/photo-1616137422495-1e9e46e2aa77?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
  grocery: "https://images.unsplash.com/photo-1542838132-92c53300491e?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
  jewellery: "https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
  sports: "https://images.unsplash.com/photo-1605408499391-6368c628ef42?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
  books: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
};

function Row({ eyebrow, title, products, to }) {
  if (!products?.length) return null;
  return (
    <section className="nx-container py-8">
      <SectionHeader eyebrow={eyebrow} title={title} action={to && <Link to={to} className="nx-btn-ghost hidden sm:inline-flex" data-testid={`row-viewall-${eyebrow}`}>View all <ArrowRight size={15} /></Link>} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {products.slice(0, 5).map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
      </div>
    </section>
  );
}

export default function Home() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/home").then(({ data }) => setData(data)).catch(() => setData({})); }, []);
  if (!data) return <Loader label="Loading marketplace" />;

  return (
    <div className="animate-fade-in">
      {/* HERO */}
      <section className="nx-container pt-6 sm:pt-8">
        <div className="grid gap-4 lg:grid-cols-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="relative overflow-hidden rounded-3xl bg-nexora-mintbg p-8 sm:p-12 lg:col-span-8">
            <div className="relative z-10 max-w-lg">
              <Badge tone="emerald"><Sparkles size={13} /> Bangladesh's premium marketplace</Badge>
              <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-nexora-ink sm:text-5xl lg:text-6xl">
                Discover shops you'll <span className="text-nexora-emerald">love</span>.
              </h1>
              <p className="mt-4 text-base text-nexora-muted sm:text-lg">Thousands of products from independent Bangladeshi sellers — fashion, food, electronics, beauty and more. All in one beautiful place.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/products" className="nx-btn-primary" data-testid="hero-shop-now">Start shopping <ArrowRight size={16} /></Link>
                <Link to="/seller/signup" className="nx-btn-ghost" data-testid="hero-become-seller">Open your shop</Link>
              </div>
            </div>
            <img src="https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?crop=entropy&cs=srgb&fm=jpg&q=85&w=900" alt="" className="pointer-events-none absolute -bottom-10 -right-10 hidden h-[120%] w-1/2 rounded-3xl object-cover opacity-90 lg:block" />
          </motion.div>
          <div className="grid gap-4 lg:col-span-4">
            <div className="flex items-center gap-4 rounded-3xl border border-nexora-border bg-white p-5">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-nexora-mintbg text-nexora-emerald"><Truck size={22} /></div>
              <div><p className="font-bold text-nexora-ink">Fast nationwide delivery</p><p className="text-sm text-nexora-muted">2–4 days across Bangladesh</p></div>
            </div>
            <div className="flex items-center gap-4 rounded-3xl border border-nexora-border bg-white p-5">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#FEF3E2] text-nexora-amber"><ShieldCheck size={22} /></div>
              <div><p className="font-bold text-nexora-ink">Verified sellers</p><p className="text-sm text-nexora-muted">Quality-checked shops only</p></div>
            </div>
            <div className="flex items-center gap-4 rounded-3xl border border-nexora-border bg-white p-5">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#FFEDE5] text-nexora-coral"><Store size={22} /></div>
              <div><p className="font-bold text-nexora-ink">{data.featured_shops?.length ? "13+" : "Many"} unique shops</p><p className="text-sm text-nexora-muted">Each with its own storefront</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="nx-container py-10">
        <SectionHeader eyebrow="Explore" title="Shop by category" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {(data.categories || []).map((c, i) => (
            <Link key={c.slug} to={`/category/${c.slug}`} data-testid={`home-cat-${c.slug}`}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-nexora-border bg-white p-3 text-center transition-all hover:-translate-y-1 hover:border-nexora-emerald hover:shadow-md">
              <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-nexora-mintbg">
                <img src={CAT_ICON_IMG[c.slug]} alt={c.name} className="h-full w-full object-cover transition-transform group-hover:scale-110" />
              </div>
              <span className="text-xs font-semibold text-nexora-ink">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <Row eyebrow="Trending" title="Trending now" products={data.trending} to="/products?sort=popular" />

      {/* DEALS banner */}
      {data.deals?.length > 0 && (
        <section className="nx-container py-8">
          <div className="rounded-3xl bg-[#FFF3EC] p-6 sm:p-8">
            <SectionHeader eyebrow="Limited time" title="Today's deals" action={<Link to="/deals" className="nx-btn-ghost hidden sm:inline-flex">All deals <ArrowRight size={15} /></Link>} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {data.deals.slice(0, 5).map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          </div>
        </section>
      )}

      <Row eyebrow="Top rated" title="Highest rated products" products={data.top_rated} to="/products?sort=rating" />

      {/* FEATURED SHOPS */}
      {data.featured_shops?.length > 0 && (
        <section className="nx-container py-8">
          <SectionHeader eyebrow="Featured" title="Shops we love" action={<Link to="/shops" className="nx-btn-ghost hidden sm:inline-flex">Browse shops <ArrowRight size={15} /></Link>} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.featured_shops.map((s) => <ShopCard key={s.id} shop={s} />)}
          </div>
        </section>
      )}

      <Row eyebrow="Just in" title="New arrivals" products={data.new_arrivals} to="/products?sort=newest" />

      {/* BRANDS */}
      {data.brands?.length > 0 && (
        <section className="nx-container py-8">
          <SectionHeader eyebrow="Featured brands" title="Popular brands" />
          <div className="flex flex-wrap gap-3">
            {data.brands.map((b) => (
              <Link key={b} to={`/products?brand=${encodeURIComponent(b)}`} className="rounded-2xl border border-nexora-border bg-white px-5 py-3 text-sm font-semibold text-nexora-ink transition-colors hover:border-nexora-emerald hover:text-nexora-emerald" data-testid={`brand-${b}`}>{b}</Link>
            ))}
          </div>
        </section>
      )}

      {/* SELLER CTA */}
      <section className="nx-container py-12">
        <div className="grid items-center gap-6 overflow-hidden rounded-3xl border border-nexora-border bg-white p-8 sm:p-12 lg:grid-cols-2">
          <div>
            <Badge tone="amber"><TrendingUp size={13} /> Grow with NEXORA</Badge>
            <h2 className="mt-3 text-2xl font-bold text-nexora-ink sm:text-3xl">Start selling to customers across Bangladesh</h2>
            <p className="mt-3 text-nexora-muted">Build your own professional storefront, manage products, and grow with plans from ৳500/month. No technical skills needed.</p>
            <Link to="/seller/signup" className="nx-btn-primary mt-6" data-testid="cta-open-shop">Open your shop <ArrowRight size={16} /></Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[["START", "৳500"], ["GROW", "৳1,500"], ["PRO", "৳3,000"]].map(([n, p], i) => (
              <div key={n} className={`rounded-2xl border p-4 text-center ${i === 1 ? "border-nexora-emerald bg-nexora-mintbg" : "border-nexora-border"}`}>
                <p className="text-xs font-bold text-nexora-muted">{n}</p>
                <p className="mt-1 text-lg font-extrabold text-nexora-ink">{p}</p>
                <p className="text-[11px] text-nexora-muted">/month</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
