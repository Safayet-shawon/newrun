import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ShieldCheck, Truck } from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { useAuth } from "@/context/AuthContext";
import { api, formatApiError } from "@/lib/api";
import { formatBDT, effectivePrice } from "@/lib/format";
import { EmptyState } from "@/components/shared/Bits";
import { toast } from "sonner";

export default function Checkout() {
  const { cart, cartTotal, clearCart } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ full_name: user?.name || "", phone: "", address: "", city: "Dhaka", area: "" });
  const [placing, setPlacing] = useState(false);
  const shipping = cartTotal > 2000 ? 0 : 60;

  useEffect(() => {
    api.get("/account/addresses").then(({ data }) => { setAddresses(data); if (data[0]) setSelected(data[0].id); }).catch(() => {});
  }, []);

  if (cart.length === 0) return <div className="py-16"><EmptyState title="Nothing to checkout" description="Your cart is empty." /></div>;

  const placeOrder = async () => {
    if (!selected && (!form.full_name || !form.phone || !form.address)) { toast.error("Please add a delivery address"); return; }
    setPlacing(true);
    try {
      if (!selected) {
        const { data } = await api.post("/account/addresses", { label: "Home", is_default: true, ...form });
        setSelected(data.id);
      }
      const { data } = await api.post("/checkout", { items: cart.map((i) => ({ product_id: i.product.id, qty: i.qty, variant: i.variant })), address_id: selected });
      clearCart();
      if (data.skipped?.length) {
        toast.warning("Some items were unavailable", { description: `${data.skipped.join(", ")} ${data.skipped.length > 1 ? "were" : "was"} out of stock and not ordered.` });
      } else {
        toast.success("Order placed! (Payment is not processed in this phase)");
      }
      navigate("/account/orders");
    } catch (e) { toast.error(formatApiError(e)); } finally { setPlacing(false); }
  };

  return (
    <div className="nx-container py-8 animate-fade-in">
      <h1 className="mb-6 text-2xl font-extrabold text-nexora-ink sm:text-3xl">Checkout</h1>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="rounded-2xl border border-nexora-border bg-white p-5">
            <h3 className="mb-4 font-bold text-nexora-ink">Delivery address</h3>
            {addresses.length > 0 && (
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                {addresses.map((a) => (
                  <button key={a.id} onClick={() => setSelected(a.id)} className={`rounded-xl border p-3 text-left text-sm ${selected === a.id ? "border-nexora-emerald bg-nexora-mintbg" : "border-nexora-border"}`} data-testid={`address-${a.id}`}>
                    <p className="font-semibold text-nexora-ink">{a.full_name} · {a.phone}</p>
                    <p className="text-nexora-muted">{a.address}, {a.area} {a.city}</p>
                  </button>
                ))}
              </div>
            )}
            {!selected && (
              <div className="grid gap-3 sm:grid-cols-2">
                {[["full_name", "Full name"], ["phone", "Phone"], ["address", "Street address"], ["area", "Area"], ["city", "City"]].map(([k, label]) => (
                  <input key={k} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder={label} className="rounded-xl border border-nexora-border p-3 text-sm outline-none focus:border-nexora-emerald" data-testid={`checkout-${k}`} />
                ))}
              </div>
            )}
            {selected && <button onClick={() => setSelected(null)} className="text-sm font-medium text-nexora-emerald" data-testid="checkout-new-address">+ Use a different address</button>}
          </div>

          <div className="rounded-2xl border border-nexora-border bg-white p-5">
            <h3 className="mb-3 font-bold text-nexora-ink">Payment</h3>
            <div className="rounded-xl bg-[#FFF3EC] p-4 text-sm text-nexora-ink">
              <p className="font-semibold">Cash on Delivery</p>
              <p className="mt-1 text-nexora-muted">Online payment integration is planned for a later phase. For now, orders are placed as Cash on Delivery.</p>
            </div>
          </div>
        </div>

        <div className="h-fit rounded-2xl border border-nexora-border bg-white p-5">
          <h3 className="text-lg font-bold text-nexora-ink">Your order</h3>
          <div className="mt-4 max-h-52 space-y-3 overflow-y-auto">
            {cart.map((i) => (
              <div key={i.key} className="flex items-center gap-3 text-sm">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-nexora-mintbg text-xs font-bold text-nexora-emeraldDark">{i.qty}</span>
                <span className="line-clamp-1 flex-1 text-nexora-ink">{i.product.title}</span>
                <span className="font-semibold">{formatBDT(effectivePrice(i.product) * i.qty)}</span>
              </div>
            ))}
          </div>
          <div className="my-4 border-t border-nexora-border" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-nexora-muted">Subtotal</span><span>{formatBDT(cartTotal)}</span></div>
            <div className="flex justify-between"><span className="text-nexora-muted">Delivery</span><span>{shipping === 0 ? "Free" : formatBDT(shipping)}</span></div>
            <div className="flex justify-between text-base font-bold"><span>Total</span><span className="text-nexora-emerald">{formatBDT(cartTotal + shipping)}</span></div>
          </div>
          <button onClick={placeOrder} disabled={placing} className="nx-btn-primary mt-5 w-full" data-testid="place-order">
            {placing ? "Placing…" : <><Check size={16} /> Place order</>}
          </button>
          <div className="mt-3 flex justify-center gap-4 text-xs text-nexora-muted">
            <span className="flex items-center gap-1"><Truck size={13} /> Fast delivery</span>
            <span className="flex items-center gap-1"><ShieldCheck size={13} /> Secure</span>
          </div>
        </div>
      </div>
    </div>
  );
}
