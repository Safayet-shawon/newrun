import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, ShieldCheck } from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { EmptyState } from "@/components/shared/Bits";
import { formatBDT, effectivePrice } from "@/lib/format";
import { resolveImage } from "@/lib/api";

export default function Cart() {
  const { cart, updateQty, removeFromCart, cartTotal } = useStore();
  const navigate = useNavigate();
  const shipping = cartTotal > 2000 || cartTotal === 0 ? 0 : 60;

  if (cart.length === 0)
    return (
      <div className="nx-container py-16">
        <EmptyState icon={ShoppingBag} title="Your cart is empty" description="Add some products you love and they'll show up here." action={<Link to="/products" className="nx-btn-primary mt-2">Start shopping</Link>} />
      </div>
    );

  return (
    <div className="nx-container py-8 animate-fade-in">
      <h1 className="mb-6 text-2xl font-extrabold text-nexora-ink sm:text-3xl">Shopping cart</h1>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {cart.map((item) => (
            <div key={item.key} className="flex gap-4 rounded-2xl border border-nexora-border bg-white p-3" data-testid={`cart-item-${item.product.id}`}>
              <Link to={`/product/${item.product.id}`} className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-nexora-mintbg">
                <img src={resolveImage(item.product.images?.[0])} alt="" className="h-full w-full object-cover" />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <Link to={`/product/${item.product.id}`} className="line-clamp-2 font-semibold text-nexora-ink hover:text-nexora-emerald">{item.product.title}</Link>
                <p className="text-xs text-nexora-muted">{item.product.shop_name}{item.variant ? ` · ${item.variant}` : ""}</p>
                <div className="mt-auto flex items-center justify-between">
                  <div className="flex items-center rounded-full border border-nexora-border">
                    <button onClick={() => updateQty(item.key, item.qty - 1)} className="grid h-8 w-8 place-items-center" data-testid={`cart-minus-${item.product.id}`}><Minus size={14} /></button>
                    <span className="w-7 text-center text-sm font-semibold">{item.qty}</span>
                    <button onClick={() => updateQty(item.key, item.qty + 1)} className="grid h-8 w-8 place-items-center" data-testid={`cart-plus-${item.product.id}`}><Plus size={14} /></button>
                  </div>
                  <span className="font-extrabold text-nexora-ink">{formatBDT(effectivePrice(item.product) * item.qty)}</span>
                </div>
              </div>
              <button onClick={() => removeFromCart(item.key)} className="self-start text-nexora-muted hover:text-nexora-coral" data-testid={`cart-remove-${item.product.id}`}><Trash2 size={18} /></button>
            </div>
          ))}
        </div>

        <div className="h-fit rounded-2xl border border-nexora-border bg-white p-5">
          <h3 className="text-lg font-bold text-nexora-ink">Order summary</h3>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-nexora-muted">Subtotal</span><span className="font-semibold">{formatBDT(cartTotal)}</span></div>
            <div className="flex justify-between"><span className="text-nexora-muted">Delivery</span><span className="font-semibold">{shipping === 0 ? "Free" : formatBDT(shipping)}</span></div>
            <div className="my-3 border-t border-nexora-border" />
            <div className="flex justify-between text-base"><span className="font-bold">Total</span><span className="font-extrabold text-nexora-emerald">{formatBDT(cartTotal + shipping)}</span></div>
          </div>
          <button onClick={() => navigate("/checkout")} className="nx-btn-primary mt-5 w-full" data-testid="cart-checkout">Proceed to checkout <ArrowRight size={16} /></button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-nexora-muted"><ShieldCheck size={14} /> Secure checkout on NEXORA</p>
        </div>
      </div>
    </div>
  );
}
