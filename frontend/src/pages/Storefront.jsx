import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Search, Store, ArrowLeft, Facebook, Instagram, MapPin, Phone } from "lucide-react";
import { api, resolveImage } from "@/lib/api";
import { Loader, EmptyState, RatingStars, Badge } from "@/components/shared/Bits";
import ProductCard from "@/components/marketplace/ProductCard";
import { getTheme } from "@/lib/themePresets";

export default function Storefront({ preview }) {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("home");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("popular");

  useEffect(() => {
    window.scrollTo(0, 0);
    api.get(`/shops/${slug}`).then(({ data }) => setData(data)).catch(() => setData({ notfound: true }));
  }, [slug]);

  if (!data) return <Loader label="Loading storefront" />;
  if (data.notfound) return (
    <div className="nx-container py-20 text-center">
      <EmptyState title="Storefront unavailable" description="This shop may be unpublished or does not exist." action={<Link to="/shops" className="nx-btn-primary mt-2">Browse shops</Link>} />
    </div>
  );

  const { shop, products, featured, reviews } = data;
  const theme = getTheme(shop.theme_preset);
  const accent = shop.accent_color || theme.accent;

  let list = products.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()));
  if (sort === "price_low") list = [...list].sort((a, b) => (a.discount_price ?? a.price) - (b.discount_price ?? b.price));
  else if (sort === "price_high") list = [...list].sort((a, b) => (b.discount_price ?? b.price) - (a.discount_price ?? a.price));
  else if (sort === "rating") list = [...list].sort((a, b) => b.rating - a.rating);

  const collections = shop.collections || [];

  return (
    <div style={{ backgroundColor: theme.bg }} className="min-h-screen">
      {/* Hero / Banner */}
      <div className="relative">
        <div className="h-56 w-full overflow-hidden sm:h-72 lg:h-80">
          <img src={resolveImage(shop.hero_image || shop.banner)} alt={shop.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        </div>
        <div className="nx-container relative -mt-16">
          <div className="flex flex-col items-start gap-4 rounded-3xl border border-nexora-border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:p-6">
            {shop.logo ? (
              <img src={resolveImage(shop.logo)} alt="" className="h-20 w-20 rounded-2xl object-cover" />
            ) : (
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl text-3xl font-extrabold text-white" style={{ backgroundColor: accent }}>{shop.name[0]}</div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className={`text-2xl font-extrabold tracking-tight text-nexora-ink sm:text-3xl ${theme.headingFont}`}>{shop.name}</h1>
                <Badge tone="ink">{theme.tag}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-nexora-muted">
                <RatingStars value={shop.rating} />
                <span className="capitalize">· {shop.category}</span>
                <span>· {products.length} products</span>
              </div>
              <p className="mt-1 line-clamp-1 text-sm text-nexora-muted">{shop.description}</p>
            </div>
            <Link to="/shops" className="nx-btn-ghost hidden sm:inline-flex"><ArrowLeft size={15} /> All shops</Link>
          </div>
        </div>
      </div>

      {/* Nav tabs */}
      <div className="nx-container sticky top-16 z-20 mt-5">
        <div className="flex gap-1 overflow-x-auto rounded-full border border-nexora-border bg-white/90 p-1 backdrop-blur no-scrollbar">
          {["home", "products", "collections", "about", "reviews"].map((t) => (
            <button key={t} onClick={() => setTab(t)} data-testid={`store-tab-${t}`}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold capitalize transition-colors ${tab === t ? "text-white" : "text-nexora-muted hover:text-nexora-ink"}`}
              style={tab === t ? { backgroundColor: accent } : {}}>{t}</button>
          ))}
        </div>
      </div>

      <div className="nx-container py-8">
        {tab === "home" && (
          <div className="space-y-10">
            <section className="overflow-hidden rounded-3xl p-8 sm:p-12" style={{ backgroundColor: "#fff", border: "1px solid #E7EEE9" }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: accent }}>{theme.tone}</p>
              <h2 className={`mt-2 max-w-xl text-3xl font-extrabold text-nexora-ink sm:text-4xl ${theme.headingFont}`}>{shop.hero_heading}</h2>
              <p className="mt-3 max-w-lg text-nexora-muted">{shop.hero_subheading}</p>
              <button onClick={() => setTab("products")} className="mt-5 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white" style={{ backgroundColor: accent }} data-testid="store-hero-cta">{shop.hero_cta || "Shop Now"}</button>
            </section>
            {featured?.length > 0 && (
              <section>
                <h3 className={`mb-5 text-xl font-bold text-nexora-ink ${theme.headingFont}`}>Featured</h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {featured.map((p, i) => <ProductCard key={p.id} product={p} index={i} aspect={theme.aspect} />)}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === "products" && (
          <div>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${shop.name}…`} className="h-11 w-full rounded-full border border-nexora-border bg-white pl-11 pr-4 text-sm outline-none" data-testid="store-search" />
              </div>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-full border border-nexora-border bg-white px-4 py-2 text-sm font-medium" data-testid="store-sort">
                <option value="popular">Most popular</option><option value="price_low">Price: Low to High</option><option value="price_high">Price: High to Low</option><option value="rating">Top rated</option>
              </select>
            </div>
            {list.length === 0 ? <EmptyState title="No products" /> : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {list.map((p, i) => <ProductCard key={p.id} product={p} index={i} aspect={theme.aspect} />)}
              </div>
            )}
          </div>
        )}

        {tab === "collections" && (
          <div className="space-y-10">
            {collections.length === 0 && <EmptyState title="No collections yet" />}
            {collections.map((col) => {
              const cps = products.filter((p) => (col.product_ids || []).includes(p.id));
              if (!cps.length) return null;
              return (
                <section key={col.id || col.name}>
                  <h3 className={`mb-5 text-xl font-bold text-nexora-ink ${theme.headingFont}`}>{col.name}</h3>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {cps.map((p, i) => <ProductCard key={p.id} product={p} index={i} aspect={theme.aspect} />)}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {tab === "about" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-3xl border border-nexora-border bg-white p-6">
              <h3 className={`text-xl font-bold text-nexora-ink ${theme.headingFont}`}>About {shop.name}</h3>
              <p className="mt-3 leading-relaxed text-nexora-muted">{shop.about || shop.description}</p>
              {shop.policies && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {shop.policies.shipping && <div className="rounded-2xl bg-nexora-mintbg p-4"><p className="font-semibold text-nexora-ink">Shipping</p><p className="mt-1 text-sm text-nexora-muted">{shop.policies.shipping}</p></div>}
                  {shop.policies.returns && <div className="rounded-2xl bg-nexora-mintbg p-4"><p className="font-semibold text-nexora-ink">Returns</p><p className="mt-1 text-sm text-nexora-muted">{shop.policies.returns}</p></div>}
                </div>
              )}
            </div>
            <div className="rounded-3xl border border-nexora-border bg-white p-6 h-fit">
              <h4 className="font-bold text-nexora-ink">Contact</h4>
              <div className="mt-3 space-y-2 text-sm text-nexora-muted">
                {shop.contact?.phone && <p className="flex items-center gap-2"><Phone size={15} /> {shop.contact.phone}</p>}
                {shop.contact?.email && <p className="flex items-center gap-2"><MapPin size={15} /> {shop.contact.email}</p>}
              </div>
              <div className="mt-4 flex gap-2">
                {shop.social_links?.facebook && <a href={shop.social_links.facebook} className="grid h-9 w-9 place-items-center rounded-full border border-nexora-border text-nexora-muted hover:text-nexora-emerald"><Facebook size={16} /></a>}
                {shop.social_links?.instagram && <a href={shop.social_links.instagram} className="grid h-9 w-9 place-items-center rounded-full border border-nexora-border text-nexora-muted hover:text-nexora-emerald"><Instagram size={16} /></a>}
              </div>
            </div>
          </div>
        )}

        {tab === "reviews" && (
          <div className="max-w-2xl space-y-4">
            {reviews.length === 0 && <EmptyState title="No reviews yet" />}
            {reviews.map((r) => (
              <div key={r.id} className="rounded-2xl border border-nexora-border bg-white p-4">
                <div className="flex items-center justify-between"><span className="font-semibold text-nexora-ink">{r.user_name}</span><RatingStars value={r.rating} /></div>
                <p className="mt-2 text-sm text-nexora-muted">{r.comment}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
