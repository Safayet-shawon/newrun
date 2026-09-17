import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, LockKeyhole, ShoppingBag } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api, formatApiError, resolveImage } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { Loader, Logo } from "@/components/shared/Bits";

const money = (value) => `৳${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

export default function InstantCheckout() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useStore();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.get(`/instant-checkout/${token}`).then(({ data: payload }) => setData(payload)).catch((e) => setError(formatApiError(e)));
  }, [token]);

  const total = useMemo(() => (data?.items || []).reduce((sum, row) => sum + Number(row.product.discount_price ?? row.product.price ?? 0) * Number(row.qty || 1), 0), [data]);

  const continueToCheckout = () => {
    setAdding(true);
    let ok = true;
    for (const row of data.items || []) {
      const added = addToCart(row.product, Number(row.qty || 1), row.variant || null, row.options || {}, row.customization || {});
      if (!added) ok = false;
    }
    setAdding(false);
    if (ok) navigate("/checkout");
  };

  if (error) return <div className="min-h-screen bg-nexora-warm"><div className="border-b border-nexora-border bg-white"><div className="nx-container flex h-16 items-center"><Logo /></div></div><div className="nx-container max-w-xl py-16"><div className="rounded-3xl border border-red-200 bg-white p-8 text-center"><h1 className="text-2xl font-extrabold text-nexora-ink">Checkout link unavailable</h1><p className="mt-2 text-sm text-nexora-muted">{error}</p><button onClick={() => navigate("/")} className="nx-btn-primary mt-6">Continue shopping</button></div></div></div>;
  if (!data) return <div className="min-h-screen bg-nexora-warm"><Loader label="Preparing your checkout" /></div>;

  return (
    <div className="min-h-screen bg-nexora-warm">
      <header className="border-b border-nexora-border bg-white"><div className="nx-container flex h-16 items-center justify-between"><Logo /><div className="flex items-center gap-2 text-xs font-bold text-nexora-muted"><LockKeyhole size={14} className="text-nexora-emerald" /> Secure Nexora checkout</div></div></header>
      <main className="nx-container max-w-4xl py-8 sm:py-12">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="rounded-3xl border border-nexora-border bg-white p-5 sm:p-7">
            <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-nexora-mintbg text-nexora-emerald"><ShoppingBag size={21} /></span><div><p className="text-xs font-bold uppercase tracking-wide text-nexora-emerald">Instant checkout</p><h1 className="text-2xl font-extrabold text-nexora-ink">Order from {data.shop_name}</h1>{data.note && <p className="mt-1 text-sm text-nexora-muted">{data.note}</p>}</div></div>
            <div className="mt-6 space-y-3">
              {data.items.map((row) => {
                const image = resolveImage((row.product.images || [])[0]);
                const unit = Number(row.product.discount_price ?? row.product.price ?? 0);
                return <div key={`${row.product.id}-${row.variant || ""}`} className="flex gap-4 rounded-2xl border border-nexora-border p-3">{image ? <img src={image} alt={row.product.title} className="h-20 w-20 rounded-xl object-cover" /> : <div className="h-20 w-20 rounded-xl bg-nexora-warm" />}<div className="min-w-0 flex-1"><p className="line-clamp-2 font-bold text-nexora-ink">{row.product.title}</p><p className="mt-1 text-sm text-nexora-muted">Qty {row.qty}{row.variant ? ` · ${row.variant}` : ""}</p><p className="mt-2 font-extrabold text-nexora-ink">{money(unit * row.qty)}</p></div></div>;
              })}
            </div>
          </section>

          <aside className="h-fit rounded-3xl border border-nexora-border bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-nexora-muted">Order summary</p>
            <div className="mt-4 flex items-center justify-between"><span className="text-sm text-nexora-muted">Products</span><b className="text-nexora-ink">{money(total)}</b></div>
            <p className="mt-2 text-xs leading-5 text-nexora-muted">Delivery charge and available payment methods are calculated on the secure checkout page using your delivery address.</p>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-nexora-warm p-3 text-xs text-nexora-muted"><Clock3 size={15} className="text-nexora-emerald" /> Link expires {new Date(data.expires_at).toLocaleString()}</div>
            <button onClick={continueToCheckout} disabled={adding} className="nx-btn-primary mt-5 w-full justify-center">{adding ? "Adding products…" : <>Continue to checkout <ArrowRight size={15} /></>}</button>
            <p className="mt-3 text-center text-[11px] leading-4 text-nexora-muted">You can review delivery details, payment method and final total before placing the order.</p>
          </aside>
        </div>
      </main>
    </div>
  );
}
