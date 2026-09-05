import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, ShieldCheck, Truck, Store, Heart, Star,
  Users, CreditCard, MoreHorizontal
} from "lucide-react";
import { api, resolveImage } from "@/lib/api";
import ProductCard from "@/components/marketplace/ProductCard";
import ShopCard from "@/components/marketplace/ShopCard";
import { SectionHeader } from "@/components/shared/Bits";

const categoryTiles = [
  { name: "Men", sub: "Fashion", slug: "fashion", image: "https://images.unsplash.com/photo-1603252110481-7ba873bf42ab?auto=format&fit=crop&w=220&q=85", bg: "#EAF4FB" },
  { name: "Women", sub: "Fashion", slug: "fashion", image: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=220&q=85", bg: "#FCE8EF" },
  { name: "Kids", sub: "Toys & More", slug: "kids", image: "https://images.unsplash.com/photo-1559454403-b8fb88521f11?auto=format&fit=crop&w=220&q=85", bg: "#FFF2D8" },
  { name: "Beauty", sub: "Self Care", slug: "beauty", image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=220&q=85", bg: "#FCE9EE" },
  { name: "Home", sub: "Living", slug: "furniture", image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=220&q=85", bg: "#E6F5EE" },
  { name: "Electronics", sub: "Gadgets", slug: "electronics", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=220&q=85", bg: "#E6F4FB" },
  { name: "Sports", sub: "& Outdoors", slug: "sports", image: "https://images.unsplash.com/photo-1599058917212-d750089bc07e?auto=format&fit=crop&w=220&q=85", bg: "#E8F7EE" },
  { name: "Books", sub: "& Stationery", slug: "books", image: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=220&q=85", bg: "#EEE9FA" },
];

const demoShops = [
  { id: "crafts", name: "Crafts of Bengal", slug: "crafts-of-bengal", rating: 4.8, product_count: 42, city: "Dhaka", theme_preset: "artisan", banner: "https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=500&q=80" },
  { id: "hernest", name: "HerNest", slug: "hernest", rating: 4.7, product_count: 36, city: "Chattogram", theme_preset: "boutique", banner: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=500&q=80" },
  { id: "tinysmiles", name: "TinySmiles", slug: "tinysmiles", rating: 4.9, product_count: 24, city: "Dhaka", theme_preset: "playful", banner: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&w=500&q=80" },
  { id: "homecanvas", name: "HomeCanvas", slug: "homecanvas", rating: 4.8, product_count: 51, city: "Rajshahi", theme_preset: "minimal", banner: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=500&q=80" },
  { id: "techmate", name: "TechMate", slug: "techmate", rating: 4.6, product_count: 63, city: "Dhaka", theme_preset: "modern", banner: "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=500&q=80" },
];

const demoProducts = [
  { id: "demo-1", title: "Urban Everyday Backpack", price: 3500, discount_price: 2450, rating: 4.7, review_count: 320, stock: 12, shop_name: "CityGear", shop_slug: "citygear", images: ["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=500&q=85"] },
  { id: "demo-2", title: "Premium Cotton Panjabi", price: 1990, discount_price: 1190, rating: 4.8, review_count: 215, stock: 20, shop_name: "DeshiWear", shop_slug: "deshiwear", images: ["https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=500&q=85"] },
  { id: "demo-3", title: "Wooden Learning Toy Set", price: 1990, discount_price: 1490, rating: 4.9, review_count: 178, stock: 17, shop_name: "TinySmiles", shop_slug: "tinysmiles", images: ["https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=500&q=85"] },
  { id: "demo-4", title: "Glow Care Skincare Kit", price: 3500, discount_price: 2290, rating: 4.7, review_count: 412, stock: 25, shop_name: "PureSelf", shop_slug: "pureself", images: ["https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=500&q=85"] },
  { id: "demo-5", title: "TWS Wireless Earbuds", price: 2990, discount_price: 1790, rating: 4.6, review_count: 301, stock: 44, shop_name: "TechMate", shop_slug: "techmate", images: ["https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=500&q=85"] },
  { id: "demo-6", title: "Minimal Table Lamp", price: 2750, discount_price: 1990, rating: 4.8, review_count: 190, stock: 10, shop_name: "HomeCanvas", shop_slug: "homecanvas", images: ["https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=500&q=85"] },
];

const money = (value) => `৳${Number(value || 0).toLocaleString("en-US")}`;

function CompactShop({ shop }) {
  const image = resolveImage(shop.banner) || demoShops[0].banner;
  return (
    <Link to={`/shop/${shop.slug}`} className="nx-compact-shop flex min-w-[220px] items-center gap-3 rounded-xl border border-[#E2EAE6] bg-white px-2.5 py-2 transition hover:border-[#9EDCC8] hover:shadow-sm lg:min-w-0">
      <img src={image} alt={shop.name} className="h-11 w-11 shrink-0 rounded-full object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-extrabold text-[#1E2B25]">{shop.name}</p>
        <p className="mt-0.5 truncate text-[9px] text-[#718078]">Independent seller</p>
        <div className="mt-1 flex items-center gap-1 text-[9px]"><Star size={10} className="fill-[#F59E0B] text-[#F59E0B]"/><b>{Number(shop.rating || 4.8).toFixed(1)}</b><span className="truncate text-[#718078]">· {shop.city || "Bangladesh"}</span></div>
      </div>
      <span className="hidden rounded-lg border border-[#CDEBDD] bg-[#F3FCF8] px-2 py-1 text-[8px] font-bold text-[#087A5F] 2xl:inline">Follow</span>
    </Link>
  );
}

function CompactProduct({ product }) {
  const hasDiscount = product.discount_price != null && Number(product.discount_price) < Number(product.price);
  const pct = hasDiscount ? Math.round((1 - Number(product.discount_price) / Number(product.price)) * 100) : 0;
  const price = hasDiscount ? product.discount_price : product.price;
  const image = resolveImage(product.images?.[0]) || demoProducts[0].images[0];

  return (
    <Link to={`/product/${product.id}`} className="nx-compact-product group min-w-0 overflow-hidden rounded-xl border border-[#E2EAE6] bg-white transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="nx-compact-product-image relative overflow-hidden bg-[#F4F7F5]">
        <img src={image} alt={product.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        {pct > 0 && <span className="absolute left-2 top-2 rounded-md bg-[#FF5E57] px-2 py-0.5 text-[9px] font-extrabold text-white">-{pct}%</span>}
        <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-white/90 shadow-sm"><Heart size={13}/></span>
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-[10px] font-semibold text-[#1E2B25]">{product.title}</p>
        <div className="mt-1 flex items-baseline gap-1.5"><b className="text-[13px] text-[#1E2B25]">{money(price)}</b>{hasDiscount && <span className="text-[8px] text-[#7D8882] line-through">{money(product.price)}</span>}</div>
        <div className="mt-1 flex items-center gap-1 text-[8px]"><Star size={9} className="fill-[#F59E0B] text-[#F59E0B]"/><b>{Number(product.rating || 4.7).toFixed(1)}</b><span className="text-[#718078]">({product.review_count || 0})</span></div>
        <p className="mt-0.5 truncate text-[8px] text-[#718078]">by {product.shop_name || "NEXORA Seller"}</p>
      </div>
    </Link>
  );
}

function PromoCard({ image, eyebrow, title, copy, button, tone = "green", to = "/products" }) {
  const coral = tone === "coral";
  return (
    <div className={`nx-promo-card relative overflow-hidden rounded-xl border border-[#E2EAE6] ${coral ? "bg-[#FFF1EA]" : "bg-white"}`}>
      <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className={`absolute inset-0 ${coral ? "bg-gradient-to-r from-[#FFF0E9] via-[#FFF0E9]/95 to-transparent" : "bg-gradient-to-r from-white via-white/92 to-transparent"}`} />
      <div className="relative z-10 flex h-full max-w-[64%] flex-col justify-center p-4">
        <p className={`text-[10px] font-semibold ${coral ? "text-[#B64A32]" : "text-[#27342E]"}`}>{eyebrow}</p>
        <h3 className={`mt-0.5 text-[19px] font-extrabold leading-tight ${coral ? "text-[#C13F2A]" : "text-[#173128]"}`}>{title}</h3>
        <p className="mt-1 text-[8px] text-[#67746D]">{copy}</p>
        <Link to={to} className={`mt-2.5 inline-flex w-fit items-center gap-1 rounded-lg px-3 py-1.5 text-[9px] font-bold text-white ${coral ? "bg-[#FF5E57]" : "bg-[#0A8D6C]"}`}>{button}<ArrowRight size={11}/></Link>
      </div>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState({});

  useEffect(() => {
    api.get("/home").then(({ data }) => setData(data || {})).catch(() => setData({}));
  }, []);

  const shops = useMemo(() => (data.featured_shops?.length ? data.featured_shops.slice(0, 5) : demoShops), [data]);
  const trending = useMemo(() => (data.trending?.length ? data.trending.slice(0, 6) : demoProducts), [data]);

  return (
    <div className="animate-fade-in bg-[#F7FAF8]">
      <section className="nx-dashboard mx-auto max-w-[1540px] px-3 pb-3 pt-2 sm:px-4 lg:px-4">
        <div className="nx-dashboard-hero relative overflow-hidden rounded-2xl border border-[#E1EBE5] bg-[#EEF7F1]">
          <img src="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1800&q=88" alt="NEXORA marketplace" className="absolute inset-0 h-full w-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#F6FAF7] via-[#F6FAF7]/96 to-[#F6FAF7]/8" />
          <div className="relative z-10 flex h-full max-w-[600px] flex-col justify-center px-6 py-5 sm:px-9">
            <h1 className="text-[29px] font-medium leading-[1.06] tracking-tight text-[#151B18] sm:text-[34px] lg:text-[38px]">
              A Marketplace<br/>for a <span className="font-extrabold text-[#087A5F]">Brighter Tomorrow</span>
            </h1>
            <p className="mt-2.5 max-w-[455px] text-[11px] leading-[1.55] text-[#5C6B64] sm:text-[12px]">Discover unique products from independent sellers across Bangladesh. Shop. Support. Grow Together.</p>
            <Link to="/products" className="mt-3 inline-flex w-fit items-center gap-2 rounded-lg bg-[#0A8D6C] px-4 py-2.5 text-[10px] font-extrabold text-white shadow-sm">Shop the Marketplace <ArrowRight size={13}/></Link>
            <div className="mt-3 hidden items-center gap-5 text-[8px] font-semibold text-[#64736C] sm:flex">
              <span className="flex items-center gap-1.5"><Store size={12} className="text-[#0A8D6C]"/>Independent Shops</span>
              <span className="flex items-center gap-1.5"><ShieldCheck size={12} className="text-[#0A8D6C]"/>Secure Payments</span>
              <span className="flex items-center gap-1.5"><Truck size={12} className="text-[#0A8D6C]"/>Nationwide Delivery</span>
            </div>
          </div>
          <div className="absolute bottom-3 right-3 hidden items-center gap-1 lg:flex">
            <span className="h-1.5 w-5 rounded-full bg-white"/><span className="h-1.5 w-1.5 rounded-full bg-white/70"/><span className="h-1.5 w-1.5 rounded-full bg-white/70"/>
          </div>
        </div>

        <div className="nx-category-strip no-scrollbar mt-2 flex items-center gap-3 overflow-x-auto rounded-2xl bg-white px-3 lg:grid lg:grid-cols-9 lg:gap-2">
          {categoryTiles.map((c) => (
            <Link key={`${c.name}-${c.slug}`} to={`/category/${c.slug}`} className="group flex min-w-[78px] flex-col items-center text-center">
              <div className="nx-category-icon grid place-items-center overflow-hidden rounded-full transition group-hover:-translate-y-0.5" style={{ background: c.bg }}>
                <img src={c.image} alt={c.name} className="h-full w-full object-cover" />
              </div>
              <b className="mt-1 text-[9px] text-[#1E2B25]">{c.name}</b>
              <span className="text-[8px] leading-tight text-[#718078]">{c.sub}</span>
            </Link>
          ))}
          <Link to="/products" className="flex min-w-[78px] flex-col items-center text-center">
            <div className="nx-category-icon grid place-items-center rounded-full bg-[#F1F5F3]"><MoreHorizontal size={20}/></div>
            <b className="mt-1 text-[9px] text-[#1E2B25]">More</b><span className="text-[8px] leading-tight text-[#718078]">Categories</span>
          </Link>
        </div>

        <div className="nx-promo-grid mt-2 grid gap-2 lg:grid-cols-3">
          <PromoCard tone="coral" eyebrow="Eid Special Deals" title="Up to 70% Off" copy="Fashion • Beauty • Home • More" button="Shop Now" to="/deals" image="https://images.unsplash.com/photo-1597983073518-3308a6b3aa22?auto=format&fit=crop&w=900&q=85" />
          <PromoCard eyebrow="Small Shops" title="Big Stories" copy="Real People. Amazing Products." button="Explore Shops" to="/shops" image="https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=85" />
          <PromoCard eyebrow="Upgrade" title="Your Everyday" copy="Smart products for a better you" button="Shop Electronics" to="/category/electronics" image="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85" />
        </div>

        <div className="nx-section-title mt-2.5 flex items-center justify-between">
          <h2 className="text-[16px] font-extrabold tracking-tight text-[#17211B]">Featured Independent Shops</h2>
          <Link to="/shops" className="flex items-center gap-1 text-[9px] font-bold text-[#087A5F]">See All Shops <ArrowRight size={12}/></Link>
        </div>
        <div className="no-scrollbar mt-1.5 flex gap-2 overflow-x-auto lg:grid lg:grid-cols-5">
          {shops.map((shop) => <CompactShop key={shop.id || shop.slug} shop={shop} />)}
        </div>

        <div className="nx-section-title mt-2.5 flex items-end justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <h2 className="shrink-0 text-[16px] font-extrabold tracking-tight text-[#17211B]">Trending Products</h2>
            <div className="hidden min-w-0 items-center gap-3 text-[8px] text-[#6F7D76] lg:flex"><b className="rounded-full bg-[#EAF7F3] px-3 py-1 text-[#087A5F]">All</b><span>Men</span><span>Women</span><span>Kids</span><span>Beauty</span><span>Home</span><span>Electronics</span><span>Sports</span><span>Books</span></div>
          </div>
          <Link to="/products?sort=popular" className="flex shrink-0 items-center gap-1 text-[9px] font-bold text-[#087A5F]">See All Products <ArrowRight size={12}/></Link>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {trending.map((p) => <CompactProduct key={p.id} product={p} />)}
        </div>

        <div className="nx-trust-strip mt-2 hidden grid-cols-5 rounded-xl border border-[#E2EAE6] bg-white px-2 lg:grid">
          <div className="flex items-center justify-center gap-2 border-r border-[#E7EEE9]"><div className="grid h-8 w-8 place-items-center rounded-full bg-[#EAF7F3] text-[#087A5F]"><Users size={15}/></div><div><b className="text-[9px]">Trusted by 500K+ customers</b><p className="text-[8px] text-[#718078]">Across Bangladesh</p></div></div>
          <div className="flex items-center justify-center gap-2 border-r border-[#E7EEE9]"><div className="grid h-8 w-8 place-items-center rounded-full bg-[#EAF7F3] text-[#087A5F]"><CreditCard size={15}/></div><div><b className="text-[9px]">Secure Payments</b><p className="text-[8px] text-[#718078]">bKash • Nagad • Cards</p></div></div>
          <div className="flex items-center justify-center gap-2 border-r border-[#E7EEE9]"><div className="grid h-8 w-8 place-items-center rounded-full bg-[#EAF7F3] text-[#087A5F]"><Truck size={15}/></div><div><b className="text-[9px]">Nationwide Delivery</b><p className="text-[8px] text-[#718078]">All across Bangladesh</p></div></div>
          <div className="flex items-center justify-center gap-2 border-r border-[#E7EEE9]"><div className="grid h-8 w-8 place-items-center rounded-full bg-[#EAF7F3] text-[#087A5F]"><Heart size={15}/></div><div><b className="text-[9px]">Support Independent Sellers</b><p className="text-[8px] text-[#718078]">A stronger marketplace</p></div></div>
          <div className="flex items-center justify-center px-3 text-center"><p className="font-display text-[12px] italic leading-tight text-[#477367]">Good People<br/>Great Products<br/><span className="text-[9px] not-italic">A Better Bangladesh ♥</span></p></div>
        </div>
      </section>

      <section className="mx-auto max-w-[1540px] px-4 py-10 lg:px-4">
        <div className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <SectionHeader eyebrow="Discover more" title="More from NEXORA" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {(data.top_rated?.length ? data.top_rated.slice(0, 5) : demoProducts.slice(0, 5)).map((p, i) => <ProductCard key={`more-${p.id}`} product={p} index={i} />)}
          </div>
        </div>
      </section>

      {data.featured_shops?.length > 0 && (
        <section className="mx-auto max-w-[1540px] px-4 pb-12 lg:px-4">
          <SectionHeader eyebrow="Keep exploring" title="More shops to discover" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{data.featured_shops.slice(0, 4).map((s) => <ShopCard key={`full-${s.id}`} shop={s}/>)}</div>
        </section>
      )}
    </div>
  );
}
