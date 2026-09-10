import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Camera, Images, Search } from "lucide-react";
import ProductCard from "@/components/marketplace/ProductCard";
import { EmptyState, SectionHeader } from "@/components/shared/Bits";

export default function VisualSearch() {
  const location = useLocation();
  const state = location.state || {};
  const items = state.items || [];

  return (
    <div className="nx-container py-6 sm:py-8">
      <div className="overflow-hidden rounded-3xl border border-[#D5E2ED] bg-gradient-to-r from-[#EAF2FB] via-white to-[#E8F7F0] p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white bg-white shadow-sm sm:h-28 sm:w-28">
            {state.preview ? <img src={state.preview} alt="Uploaded search" className="h-full w-full object-cover" /> : <Images size={30} className="text-[#5E7890]" />}
          </div>
          <div className="min-w-0 flex-1">
            <SectionHeader eyebrow="Visual search" title="Products that look similar" />
            <p className="mt-1 text-sm text-nexora-muted">{items.length ? `Found ${items.length} strong visual matches from ${state.totalCompared || items.length} product images checked.` : "No close visual match was found in the current catalogue."}</p>
            <p className="mt-2 text-xs text-[#55718B]">Photo search compares visual appearance. For a specific brand, model, size or specification, text search is still the most precise option.</p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-nexora-ink"><Camera size={17} className="text-nexora-emerald" /> Search by image results</div>
        <Link to="/products" className="inline-flex items-center gap-2 rounded-full border border-[#D3E0EA] bg-white px-4 py-2 text-xs font-bold text-[#315C89] hover:bg-[#EAF2FB]"><Search size={14} /> Browse all products</Link>
      </div>

      {!items.length ? (
        <div className="mt-5"><EmptyState title="No similar products yet" description="Try another photo with the product clearly visible, or search by product name." action={<Link to="/products" className="nx-btn-primary mt-2">Browse products</Link>} /></div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
        </div>
      )}
    </div>
  );
}
