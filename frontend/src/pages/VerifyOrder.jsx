import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

const money = (paisa) => `৳${(Number(paisa || 0) / 100).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

export default function VerifyOrder() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [last4, setLast4] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/order-verification/${token}`).then(({ data }) => setData(data)).catch((e) => setError(formatApiError(e)));
  }, [token]);

  const confirm = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(last4)) { setError("Enter the last 4 digits of the delivery phone number."); return; }
    setBusy(true); setError("");
    try { await api.post(`/order-verification/${token}`, { phone_last4: last4 }); setDone(true); }
    catch (e) { setError(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return <div className="min-h-screen bg-[#F7FAF8] px-4 py-10"><div className="mx-auto max-w-lg rounded-3xl border border-[#E7EEE9] bg-white p-6 shadow-sm sm:p-8">
    <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ECFDF5] text-[#10B981]"><ShieldCheck size={24}/></span><div><p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#10B981]">Nexora secure verification</p><h1 className="text-xl font-extrabold text-[#17211B]">Confirm this order</h1></div></div>
    {done ? <div className="mt-8 rounded-2xl bg-[#ECFDF5] p-6 text-center"><CheckCircle2 className="mx-auto text-[#10B981]" size={40}/><h2 className="mt-3 text-xl font-extrabold text-[#17211B]">Order confirmed</h2><p className="mt-2 text-sm text-[#66736B]">Your confirmation was recorded. The seller can now continue processing this order.</p></div> : error && !data ? <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : !data ? <p className="mt-8 text-sm text-[#66736B]">Loading order…</p> : <>
      <div className="mt-6 rounded-2xl border border-[#E7EEE9] p-4"><div className="flex justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[#66736B]">Store</p><p className="font-extrabold text-[#17211B]">{data.shop_name || "Nexora seller"}</p></div><div className="text-right"><p className="text-xs font-bold uppercase tracking-wide text-[#66736B]">Total</p><p className="font-extrabold text-[#17211B]">{money(data.total_paisa)}</p></div></div><div className="mt-4 space-y-2">{(data.items || []).map((item, i)=><div key={`${item.title}-${i}`} className="flex justify-between text-sm"><span className="text-[#17211B]">{item.title}</span><span className="font-bold text-[#66736B]">×{item.qty}</span></div>)}</div></div>
      <form onSubmit={confirm} className="mt-6 space-y-3"><label className="block"><span className="mb-1 block text-sm font-bold text-[#17211B]">Last 4 digits of delivery phone</span><input inputMode="numeric" maxLength={4} value={last4} onChange={(e)=>setLast4(e.target.value.replace(/\D/g, "").slice(0,4))} placeholder={data.phone_hint || "••••"} className="w-full rounded-xl border border-[#E7EEE9] px-4 py-3 text-lg tracking-[.3em] outline-none focus:border-[#10B981]"/></label>{error && <p className="text-sm font-semibold text-red-600">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-[#10B981] px-4 py-3 font-extrabold text-white disabled:opacity-60">{busy ? "Confirming…" : "Yes, I placed this order"}</button><p className="text-xs leading-relaxed text-[#66736B]">Only confirm if you recognize this store and order. Nexora will never ask for your password, OTP, PIN or card details on this page.</p></form>
    </>}
  </div></div>;
}
