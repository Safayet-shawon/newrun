import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Heart, ShoppingBag, Store, Truck, ShieldCheck, RotateCcw, Minus, Plus, ArrowRight, Star } from "lucide-react";
import { api, resolveImage } from "@/lib/api";
import { Loader, RatingStars, Badge, SectionHeader } from "@/components/shared/Bits";
import { formatBDT, effectivePrice, discountPercent, stockState } from "@/lib/format";
import { useStore } from "@/context/StoreContext";
import { useAuth } from "@/context/AuthContext";
import ProductCard from "@/components/marketplace/ProductCard";
import { toast } from "sonner";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart, toggleWishlist, isWished, addRecent } = useStore();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [variant, setVariant] = useState({});
  const [tab, setTab] = useState("desc");
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });

  useEffect(() => {
    window.scrollTo(0, 0);
    api.get(`/products/${id}`).then(({ data }) => {
      setData(data); setActiveImg(0); setQty(1);
      addRecent(data.product);
    }).catch(() => setData({ notfound: true }));
  }, [id]);

  if (!data) return <Loader label="Loading product" />;
  if (data.notfound) return <div className="nx-container py-20 text-center"><p className="text-nexora-muted">Product not found.</p></div>;

  const { product: p, shop, similar, frequently_bought, reviews } = data;
  const disc = discountPercent(p);
  const stock = stockState(p);

  const submitReview = async () => {
    if (!user) { toast.error("Please sign in to write a review"); navigate("/login"); return; }
    if (!reviewForm.comment.trim()) { toast.error("Write a short comment"); return; }
    try {
      await api.post("/reviews", { product_id: p.id, rating: reviewForm.rating, comment: reviewForm.comment });
      toast.success("Review posted");
      const { data: fresh } = await api.get(`/products/${id}`);
      setData(fresh); setReviewForm({ rating: 5, comment: "" });
    } catch { toast.error("Could not post review"); }
  };

  return (
    <div className="nx-container py-8 animate-fade-in">
      <nav className="mb-5 text-sm text-nexora-muted">
        <Link to="/" className="hover:text-nexora-emerald">Home</Link> / <Link to={`/category/${p.category}`} className="hover:text-nexora-emerald capitalize">{p.category}</Link> / <span className="text-nexora-ink">{p.title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Gallery */}
        <div>
          <div className="aspect-square overflow-hidden rounded-3xl border border-nexora-border bg-white">
            <img src={resolveImage(p.images?.[activeImg])} alt={p.title} className="h-full w-full object-cover" data-testid="pdp-main-image" />
          </div>
          <div className="mt-3 flex gap-3">
            {(p.images || []).map((img, i) => (
              <button key={i} onClick={() => setActiveImg(i)} className={`h-20 w-20 overflow-hidden rounded-xl border-2 ${activeImg === i ? "border-nexora-emerald" : "border-nexora-border"}`} data-testid={`pdp-thumb-${i}`}>
                <img src={resolveImage(img)} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Info */}
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="emerald">{p.brand}</Badge>
            {disc > 0 && <Badge tone="coral">-{disc}% OFF</Badge>}
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-nexora-ink sm:text-3xl">{p.title}</h1>
          <div className="mt-2 flex items-center gap-3">
            <RatingStars value={p.rating} count={p.review_count} />
            <span className="text-sm text-nexora-muted">· {p.sold_count} sold</span>
          </div>

          <div className="mt-4 flex items-end gap-3">
            <span className="text-3xl font-extrabold text-nexora-ink">{formatBDT(effectivePrice(p))}</span>
            {p.discount_price != null && <span className="pb-1 text-lg text-nexora-muted line-through">{formatBDT(p.price)}</span>}
          </div>
          <p className={`mt-1 text-sm font-semibold ${stock.tone === "out" ? "text-nexora-coral" : stock.tone === "low" ? "text-nexora-amber" : "text-nexora-emerald"}`}>{stock.label}</p>

          {/* Variants */}
          {(p.variants || []).map((v) => (
            <div key={v.name} className="mt-5">
              <p className="mb-2 text-sm font-semibold text-nexora-ink">{v.name}</p>
              <div className="flex flex-wrap gap-2">
                {v.options.map((opt) => (
                  <button key={opt} onClick={() => setVariant((s) => ({ ...s, [v.name]: opt }))} data-testid={`variant-${v.name}-${opt}`}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${variant[v.name] === opt ? "border-nexora-emerald bg-nexora-mintbg text-nexora-emeraldDark" : "border-nexora-border text-nexora-ink hover:border-nexora-emerald"}`}>{opt}</button>
                ))}
              </div>
            </div>
          ))}

          {/* Qty + actions */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-full border border-nexora-border">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-11 w-11 place-items-center text-nexora-ink" data-testid="qty-minus"><Minus size={16} /></button>
              <span className="w-8 text-center font-semibold" data-testid="qty-value">{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} className="grid h-11 w-11 place-items-center text-nexora-ink" data-testid="qty-plus"><Plus size={16} /></button>
            </div>
            <button disabled={stock.tone === "out"} onClick={() => { addToCart(p, qty, Object.values(variant).join("/")); }} className="nx-btn-primary flex-1 min-w-[160px]" data-testid="pdp-add-to-cart">
              <ShoppingBag size={18} /> Add to cart
            </button>
            <button onClick={() => toggleWishlist(p)} className="grid h-11 w-11 place-items-center rounded-full border border-nexora-border hover:border-nexora-coral" data-testid="pdp-wishlist">
              <Heart size={18} className={isWished(p.id) ? "fill-nexora-coral text-nexora-coral" : ""} />
            </button>
          </div>

          {/* delivery info */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[[Truck, "Nationwide delivery"], [ShieldCheck, "Verified seller"], [RotateCcw, "7-day returns"]].map(([Ic, t]) => (
              <div key={t} className="flex flex-col items-center gap-1.5 rounded-2xl border border-nexora-border bg-white p-3 text-center">
                <Ic size={18} className="text-nexora-emerald" /><span className="text-[11px] font-medium text-nexora-muted">{t}</span>
              </div>
            ))}
          </div>

          {/* seller card */}
          {shop && (
            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-nexora-border bg-white p-4">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-nexora-emerald text-lg font-extrabold text-white">{shop.name[0]}</div>
              <div className="flex-1"><p className="font-bold text-nexora-ink">{shop.name}</p><RatingStars value={shop.rating} /></div>
              <Link to={`/shop/${shop.slug}`} className="nx-btn-ghost" data-testid="pdp-visit-store"><Store size={15} /> Visit store</Link>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-12">
        <div className="flex gap-6 border-b border-nexora-border">
          {[["desc", "Description"], ["specs", "Specifications"], ["reviews", `Reviews (${p.review_count})`]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 pb-3 text-sm font-semibold ${tab === k ? "border-nexora-emerald text-nexora-ink" : "border-transparent text-nexora-muted"}`} data-testid={`tab-${k}`}>{l}</button>
          ))}
        </div>
        <div className="py-6">
          {tab === "desc" && <p className="max-w-3xl leading-relaxed text-nexora-muted">{p.description}</p>}
          {tab === "specs" && (
            <div className="max-w-xl divide-y divide-nexora-border rounded-2xl border border-nexora-border">
              {[...(p.attributes || []).map((a) => [a.name, a.value]), ...Object.entries(p.specs || {})].map(([k, v], i) => (
                <div key={i} className="flex justify-between px-4 py-3 text-sm"><span className="text-nexora-muted">{k}</span><span className="font-medium text-nexora-ink">{v}</span></div>
              ))}
            </div>
          )}
          {tab === "reviews" && (
            <div className="grid gap-8 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-4">
                {(reviews || []).length === 0 && <p className="text-nexora-muted">No reviews yet. Be the first!</p>}
                {(reviews || []).map((r) => (
                  <div key={r.id} className="rounded-2xl border border-nexora-border bg-white p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-nexora-ink">{r.user_name}</span>
                      <span className="inline-flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={14} className={i < r.rating ? "fill-nexora-amber text-nexora-amber" : "text-nexora-border"} />)}</span>
                    </div>
                    <p className="mt-2 text-sm text-nexora-muted">{r.comment}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-nexora-border bg-white p-4 h-fit">
                <h4 className="font-bold text-nexora-ink">Write a review</h4>
                <div className="mt-3 flex gap-1">
                  {[1,2,3,4,5].map((n) => <button key={n} onClick={() => setReviewForm((f) => ({ ...f, rating: n }))} data-testid={`review-star-${n}`}><Star size={22} className={n <= reviewForm.rating ? "fill-nexora-amber text-nexora-amber" : "text-nexora-border"} /></button>)}
                </div>
                <textarea value={reviewForm.comment} onChange={(e) => setReviewForm((f) => ({ ...f, comment: e.target.value }))} placeholder="Share your experience…" rows={3} className="mt-3 w-full rounded-xl border border-nexora-border p-3 text-sm outline-none focus:border-nexora-emerald" data-testid="review-comment" />
                <button onClick={submitReview} className="nx-btn-primary mt-3 w-full" data-testid="submit-review">Post review</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {frequently_bought?.length > 0 && (
        <section className="mt-8">
          <SectionHeader eyebrow="Bundle" title="Frequently bought together" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
            {frequently_bought.map((sp, i) => <ProductCard key={sp.id} product={sp} index={i} />)}
          </div>
        </section>
      )}

      {similar?.length > 0 && (
        <section className="mt-10">
          <SectionHeader eyebrow="You may also like" title="Similar products" action={<Link to={`/category/${p.category}`} className="nx-btn-ghost hidden sm:inline-flex">More <ArrowRight size={15} /></Link>} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {similar.slice(0, 5).map((sp, i) => <ProductCard key={sp.id} product={sp} index={i} />)}
          </div>
        </section>
      )}
    </div>
  );
}
