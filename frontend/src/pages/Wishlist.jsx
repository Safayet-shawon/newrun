import React from "react";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { EmptyState } from "@/components/shared/Bits";
import ProductCard from "@/components/marketplace/ProductCard";

export default function Wishlist({ embedded }) {
  const { wishlist } = useStore();
  const body = wishlist.length === 0 ? (
    <EmptyState icon={Heart} title="Your wishlist is empty" description="Tap the heart on any product to save it for later." action={<Link to="/products" className="nx-btn-primary mt-2">Discover products</Link>} />
  ) : (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {wishlist.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
    </div>
  );

  if (embedded) return <div><h2 className="mb-5 text-xl font-bold text-nexora-ink">Saved items ({wishlist.length})</h2>{body}</div>;

  return (
    <div className="nx-container py-8 animate-fade-in">
      <h1 className="mb-6 text-2xl font-extrabold text-nexora-ink sm:text-3xl">My wishlist</h1>
      {body}
    </div>
  );
}
