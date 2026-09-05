import React from "react";
import { Link } from "react-router-dom";
import { Store, ArrowRight } from "lucide-react";
import { RatingStars, Badge } from "@/components/shared/Bits";
import { resolveImage } from "@/lib/api";
import { getTheme } from "@/lib/themePresets";
import FollowShopButton from "@/components/marketplace/FollowShopButton";

export default function ShopCard({ shop }) {
  const theme = getTheme(shop.theme_preset);
  return (
    <article
      className="group flex flex-col overflow-hidden rounded-2xl border border-nexora-border bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
      data-testid={`shop-card-${shop.slug}`}
    >
      <Link to={`/shop/${shop.slug}`} className="relative h-32 overflow-hidden">
        <img src={resolveImage(shop.banner)} alt={shop.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        <div className="absolute left-3 top-3"><Badge tone="ink">{theme.tag}</Badge></div>
      </Link>
      <div className="flex items-center gap-3 p-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-nexora-emerald text-lg font-extrabold text-white">
          {shop.name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <Link to={`/shop/${shop.slug}`} className="block truncate font-bold text-nexora-ink">{shop.name}</Link>
          <div className="mt-0.5 flex items-center gap-2">
            <RatingStars value={shop.rating} />
            <span className="text-xs text-nexora-muted">· {shop.product_count ?? 0} products</span>
          </div>
        </div>
        <Link to={`/shop/${shop.slug}`} aria-label={`Visit ${shop.name}`}><ArrowRight size={18} className="text-nexora-muted transition-colors group-hover:text-nexora-emerald" /></Link>
      </div>
      <div className="px-4 pb-4"><FollowShopButton shopId={shop.id} className="nx-btn-ghost w-full"/></div>
    </article>
  );
}
