import React from "react";
import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { EmptyState } from "@/components/shared/Bits";
import ProductCard from "@/components/marketplace/ProductCard";

export default function AccountRecent() {
  const { recent } = useStore();
  return (
    <div>
      <h2 className="mb-5 text-xl font-bold text-nexora-ink">Recently viewed</h2>
      {recent.length === 0 ? (
        <EmptyState icon={Clock} title="Nothing here yet" description="Products you view will appear here." action={<Link to="/products" className="nx-btn-primary mt-2">Browse products</Link>} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {recent.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
        </div>
      )}
    </div>
  );
}
