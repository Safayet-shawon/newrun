import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, ShoppingBag, Store } from "lucide-react";
import { motion } from "framer-motion";
import { RatingStars } from "@/components/shared/Bits";
import { formatBDT, discountPercent, effectivePrice, stockState } from "@/lib/format";
import { resolveImage } from "@/lib/api";
import { useStore } from "@/context/StoreContext";

export default function ProductCard({ product, index = 0, aspect = "aspect-square" }) {
  const { addToCart, toggleWishlist, isWished } = useStore();
  const navigate = useNavigate();
  const disc = discountPercent(product);
  const stock = stockState(product);
  const wished = isWished(product.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.3) }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-nexora-border bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
      data-testid={`product-card-${product.id}`}
    >
      <Link to={`/product/${product.id}`} className={`relative block ${aspect} overflow-hidden bg-nexora-mintbg`}>
        <img
          src={resolveImage(product.images?.[0])}
          alt={product.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {disc > 0 && (
            <span className="rounded-full bg-nexora-coral px-2 py-0.5 text-xs font-bold text-white shadow-sm">-{disc}%</span>
          )}
          {stock.tone === "out" && (
            <span className="rounded-full bg-nexora-ink/80 px-2 py-0.5 text-[11px] font-semibold text-white">Sold out</span>
          )}
        </div>
        <button
          onClick={(e) => { e.preventDefault(); toggleWishlist(product); }}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-nexora-ink shadow-sm backdrop-blur transition-colors hover:bg-white"
          data-testid={`wishlist-toggle-${product.id}`}
          aria-label="Toggle wishlist"
        >
          <Heart size={17} className={wished ? "fill-nexora-coral text-nexora-coral" : ""} />
        </button>
      </Link>

      <div className="flex flex-1 flex-col p-3.5">
        <Link
          to={`/shop/${product.shop_slug}`}
          className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-nexora-muted hover:text-nexora-emerald"
          data-testid={`product-shop-${product.id}`}
        >
          <Store size={12} /> {product.shop_name}
        </Link>
        <Link to={`/product/${product.id}`} className="line-clamp-2 text-sm font-semibold leading-snug text-nexora-ink hover:text-nexora-emerald">
          {product.title}
        </Link>
        <div className="mt-2">
          <RatingStars value={product.rating} count={product.review_count} />
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <div className="text-base font-extrabold text-nexora-ink">{formatBDT(effectivePrice(product))}</div>
            {product.discount_price != null && (
              <div className="text-xs text-nexora-muted line-through">{formatBDT(product.price)}</div>
            )}
          </div>
          <button
            onClick={() => (stock.tone === "out" ? navigate(`/product/${product.id}`) : addToCart(product))}
            disabled={stock.tone === "out"}
            className="grid h-9 w-9 place-items-center rounded-full bg-nexora-mintbg text-nexora-emeraldDark transition-colors hover:bg-nexora-emerald hover:text-white disabled:opacity-40"
            data-testid={`quick-add-${product.id}`}
            aria-label="Quick add to cart"
          >
            <ShoppingBag size={16} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
