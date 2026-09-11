import React, { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Check, ShieldCheck, Truck } from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { useAuth } from "@/context/AuthContext";
import { api, formatApiError } from "@/lib/api";
import { formatBDT, effectivePrice } from "@/lib/format";
import { EmptyState } from "@/components/shared/Bits";
import { toast } from "sonner";

const blankAddress = (name = "") => ({
  full_name: name,
  phone: "",
  address: "",
  address_line2: "",
  area: "",
  city: "",
  state: "",
  postal_code: "",
  country_code: "BD",
});

export default function Checkout() {
  const { cart, cartTotal, clearCart } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(blankAddress(user?.name || ""));
  const [placing, setPlacing] = useState(false);
  const [quote, setQuote] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cash_on_delivery");
  const [wallet, setWallet] = useState(null);
  useEffect(() => { api.get("/account/wallet").then(({ data }) => setWallet(data)).catch(() => {}); }, []);
  const requestKey = useRef(crypto.randomUUID());
  useEffect(() => { setQuote(null); requestKey.current = crypto.randomUUID(); }, [cart, selected, paymentMethod]);

  useEffect(() => {
    api.get("/account/addresses").then(({ data }) => { setAddresses(data); if (data[0]) setSelected(data[0].id); }).catch(() => {});
  }, []);

  if (cart.length === 0) return <div className="py-16"><EmptyState title="Nothing to checkout" description="Your cart is empty." /></div>;

  const placeOrder = async () => {
    if (!selected && (!form.full_name.trim() || !form.phone.trim() || !form.address.trim() || !form.city.trim() || form.country_code.trim().length !== 2)) {
      toast.error("Please complete your delivery address, including a 2-letter country code");
      return;
    }
    setPlacing(true);
    try {
      let addressId = selected;
      if (!addressId) {
        const { data } = await api.post("/account/addresses", { label: "Home", is_default: true, ...form, country_code: form.country_code.toUpperCase() });
        addressId = data.id;
        setAddresses((previous) => [...previous, data]);
        setSelected(addressId);
        toast.info("Address saved. Review your order to continue.");
        return;
      }
      const payload = {
        items: cart.map((i) => ({ product_id: i.product.id, qty: i.qty, variant: i.variant || null, options: i.options || {}, customization: i.customization || {} })),
        address_id: addressId,
        payment_method: paymentMethod,
        idempotency_key: requestKey.current,
      };
      if (!quote) {
        const { data } = await api.post("/checkout/quote", payload);
        setQuote(data);
        return;
      }
      const { data: placed } = await api.post("/checkout", { ...payload, expected_total_paisa: quote.total_paisa });
      clearCart();
      toast.success(paymentMethod === "nexora_wallet" ? "Order placed using Nexora Wallet." : "Order placed. Payment is due on delivery.");
      navigate("/account/order-success", { state: { orders: placed.orders } });
    } catch (e) {
      setQuote(null);
      toast.error(formatApiError(e));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="nx-container py-8 animate-fade-in">
      <h1 className="mb-6 text-2xl font-extrabold text-nexora-ink sm:text-3xl">Checkout</h1>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="rounded-2xl border border-nexora-border bg-white p-5">
            <h3 className="mb-1 font-bold text-nexora-ink">Delivery address</h3>
            <p className="mb-4 text-xs text-nexora-muted">International addresses use ISO country codes such as BD, US, GB, IT, FI or AU.</p>
            {addresses.length > 0 && (
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                {addresses.map((a) => (
                  <button key={a.id} onClick={() => setSelected(a.id)} className={`rounded-xl border p-3 text-left text-sm ${selected === a.id ? "border-nexora-emerald bg-nexora-mintbg" : "border-nexora-border"}`} data-testid={`address-${a.id}`}>
                    <p className="font-semibold text-nexora-ink">{a.full_name} · {a.phone}</p>
                    <p className="text-nexora-muted">{[a.address, a.address_line2, a.area, a.city, a.state, a.postal_code, a.country_code].filter(Boolean).join(", ")}</p>
                  </button>
                ))}
              </div>
            )}
            {!selected && (
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["full_name", "Full name"], ["phone", "Phone with country code"], ["address", "Street address"],
                  ["address_line2", "Apartment / suite"], ["area", "Area / district"], ["city", "City"],
                  ["state", "State / province"], ["postal_code", "Postal / ZIP code"], ["country_code", "Country code"],
                ].map(([k, label]) => (
                  <input key={k} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: k === "country_code" ? e.target.value.toUpperCase().slice(0, 2) : e.target.value }))} aria-label={label} placeholder={label} className="rounded-xl border border-nexora-border p-3 text-sm outline-none focus:border-nexora-emerald" data-testid={`checkout-${k}`} />
                ))}
              </div>
            )}
            {selected && <button onClick={() => setSelected(null)} className="text-sm font-medium text-nexora-emerald" data-testid="checkout-new-address">+ Use a different address</button>}
          </div>

          <div className="rounded-2xl border border-nexora-border bg-white p-5">
            <h3 className="mb-3 font-bold text-nexora-ink">Payment</h3>
            <fieldset className="space-y-3"><legend className="sr-only">Choose payment method</legend>
              {[["cash_on_delivery", "Cash on delivery", "Available where the seller and destination support it."], ["nexora_wallet", "Nexora Wallet", wallet ? `${formatBDT(wallet.balance_paisa / 100)} available${wallet.mode === "sandbox" ? " · Test balance" : ""}` : "Balance unavailable. Refresh to try again."]].map(([value, title, detail]) => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${paymentMethod === value ? "border-nexora-emerald bg-nexora-mintbg" : "border-nexora-border"}`}><input type="radio" name="payment" value={value} checked={paymentMethod === value} onChange={() => setPaymentMethod(value)} className="mt-1" /><span><strong className="block text-sm">{title}</strong><span className="text-sm text-nexora-muted">{detail}</span></span></label>)}
            </fieldset>
            {paymentMethod === "nexora_wallet" && <div className="mt-3 text-sm"><Link to="/account/wallet" className="font-semibold text-nexora-emerald">Add money to your wallet →</Link><p className="mt-1 text-nexora-muted">Your cart stays saved while you add money.</p>{quote && wallet && quote.total_paisa > wallet.balance_paisa && <p role="alert" className="mt-2 text-nexora-coral">You need {formatBDT((quote.total_paisa - wallet.balance_paisa) / 100)} more to pay with your wallet.</p>}</div>}
            <p className="mt-4 text-xs text-nexora-muted">Nexora keeps settlement totals server-verified. Additional international payment providers can be enabled by deployment configuration.</p>
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
            <div className="flex justify-between"><span className="text-nexora-muted">Subtotal</span><span>{formatBDT(quote ? quote.subtotal_paisa / 100 : cartTotal)}</span></div>
            <div className="flex justify-between"><span className="text-nexora-muted">Delivery</span><span>{quote ? formatBDT(quote.delivery_paisa / 100) : "Calculated per shop"}</span></div>
            {quote?.groups?.length > 1 && <div className="rounded-xl bg-slate-50 p-2 text-xs text-nexora-muted">{quote.groups.map((g) => <div key={g.shop_id} className="flex justify-between gap-3"><span className="truncate">{g.shop_name}</span><span>{formatBDT(g.delivery_paisa / 100)}</span></div>)}</div>}
            <div className="flex justify-between text-base font-bold"><span>Total</span><span className="text-nexora-emerald">{quote ? formatBDT(quote.total_paisa / 100) : "Review order"}</span></div>
          </div>
          <button onClick={placeOrder} disabled={placing} className="nx-btn-primary mt-5 w-full" data-testid="place-order">
            {placing ? "Please wait…" : <><Check size={16} /> {quote ? (paymentMethod === "nexora_wallet" ? "Pay with Nexora Wallet" : "Confirm cash-on-delivery order") : "Review order"}</>}
          </button>
          <div className="mt-3 flex justify-center gap-4 text-xs text-nexora-muted">
            <span className="flex items-center gap-1"><Truck size={13} /> Per-shop delivery</span>
            <span className="flex items-center gap-1"><ShieldCheck size={13} /> Server-verified total</span>
          </div>
        </div>
      </div>
    </div>
  );
}
