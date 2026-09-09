import React, { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  TrendingUp,
  Gauge,
  BadgeDollarSign,
  Boxes,
  ShieldCheck,
  ArrowRight,
  Send,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import LockGate from "@/components/seller/LockGate";
import { useSeller } from "@/context/SellerContext";

const money = (v) => `৳${Number(v || 0).toLocaleString()}`;

function Score({ value }) {
  return (
    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#FFF7E6] text-lg font-extrabold text-nexora-amber">
      {Number(value || 0)}
    </div>
  );
}

export default function Intelligence() {
  const { ent } = useSeller();
  const allowed = !!ent?.marketplace_intelligence;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/seller/intelligence/overview");
      setData(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Could not build marketplace intelligence");
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    load();
  }, [load]);

  const ask = async (e) => {
    e.preventDefault();
    const text = question.trim();
    if (!text || asking) return;
    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setAsking(true);
    try {
      const response = await api.post("/seller/intelligence/ask", { question: text });
      setMessages((prev) => [...prev, { role: "assistant", text: response.data.answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: err.response?.data?.detail || "I could not analyze that request. Try again." },
      ]);
    } finally {
      setAsking(false);
    }
  };

  if (!allowed) {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-nexora-amber">PRO</p>
          <h1 className="text-2xl font-extrabold text-nexora-ink">Nexora Intelligence</h1>
          <p className="text-sm text-nexora-muted">Marketplace-wide demand, supply and pricing intelligence.</p>
        </div>
        <LockGate feature="marketplace_intelligence" entitlements={ent} />
      </div>
    );
  }

  if (loading && !data) return <Loader label="Building marketplace intelligence" />;

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-[#FFD4C4] bg-[#FFF8F4] p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 text-nexora-coral" size={20} />
          <div className="flex-1">
            <h2 className="font-extrabold text-nexora-ink">Nexora Intelligence could not load</h2>
            <p className="mt-1 text-sm text-nexora-muted">{error}</p>
            <button onClick={load} className="nx-btn-primary mt-4">
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const top = data?.opportunities?.[0];
  const marketTop = data?.market_opportunities?.[0];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-nexora-amber/30 bg-gradient-to-br from-[#FFF9ED] via-white to-[#ECFDF5] p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#FFF1CC] px-3 py-1 text-xs font-extrabold text-[#A96D00]">
              <Sparkles size={14} /> PRO · NEXORA INTELLIGENCE
            </div>
            <h1 className="text-3xl font-extrabold text-nexora-ink">Know what the marketplace is telling you.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-nexora-muted">
              Live catalogue/order signals, historical fallback when recent orders are sparse, privacy-safe pricing and stock recommendations.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white px-3 py-1 font-semibold text-nexora-muted">
                Signal: {data?.signal_mode === "historical_fallback" ? "Historical fallback" : "Recent orders"}
              </span>
              <span className="rounded-full bg-white px-3 py-1 font-semibold text-nexora-muted">
                {data?.marketplace_summary?.published_products || 0} products measured
              </span>
              <span className="rounded-full bg-white px-3 py-1 font-semibold text-nexora-muted">
                {data?.marketplace_summary?.categories_measured || 0} categories measured
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={load} disabled={loading} className="nx-btn-ghost">
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <Link to="/seller/dashboard/import-store" className="nx-btn-primary whitespace-nowrap">
              Import catalogue <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-nexora-border bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-nexora-muted">Best match for your shop</p>
              <p className="mt-2 text-xl font-extrabold text-nexora-ink">{top?.category || "Collecting data"}</p>
              <p className="mt-1 text-xs text-nexora-muted">{top ? `${top.competition} competition · ${top.confidence} confidence` : data?.data_window}</p>
            </div>
            <Score value={top?.opportunity_score} />
          </div>
        </div>
        <div className="rounded-2xl border border-nexora-border bg-white p-5">
          <TrendingUp className="text-nexora-emerald" size={22} />
          <p className="mt-3 text-xl font-extrabold text-nexora-ink">{marketTop?.category || "—"}</p>
          <p className="text-sm text-nexora-muted">Top marketplace opportunity</p>
        </div>
        <div className="rounded-2xl border border-nexora-border bg-white p-5">
          <Gauge className="text-nexora-emerald" size={22} />
          <p className="mt-3 text-2xl font-extrabold text-nexora-ink">{data?.marketplace_summary?.your_published_products || 0}</p>
          <p className="text-sm text-nexora-muted">Your products measured</p>
        </div>
        <div className="rounded-2xl border border-nexora-border bg-white p-5">
          <ShieldCheck className="text-nexora-emerald" size={22} />
          <p className="mt-3 font-extrabold text-nexora-ink">Privacy-safe</p>
          <p className="mt-1 text-sm text-nexora-muted">Competitor private revenue/customer data is never exposed.</p>
        </div>
      </div>

      <section className="rounded-2xl border border-nexora-border bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="text-nexora-emerald" size={20} />
          <h2 className="font-extrabold text-nexora-ink">Demand & supply opportunities</h2>
        </div>
        {data?.opportunities?.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.opportunities.map((o) => (
              <div key={o.category} className="rounded-2xl border border-nexora-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold capitalize text-nexora-ink">{o.category}</p>
                    <p className="text-xs text-nexora-muted">Demand {o.demand_score}/100 · {o.seller_count} seller(s) · {o.product_count} product(s)</p>
                  </div>
                  <span className="rounded-full bg-nexora-mintbg px-3 py-1 text-xs font-extrabold text-nexora-emerald">Opportunity {o.opportunity_score}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-[#F8FAF9] p-2"><p className="text-sm font-bold">{o.recent_units_14d}</p><p className="text-[11px] text-nexora-muted">recent units</p></div>
                  <div className="rounded-xl bg-[#F8FAF9] p-2"><p className="text-sm font-bold">{o.demand_change_pct > 0 ? "+" : ""}{o.demand_change_pct}%</p><p className="text-[11px] text-nexora-muted">trend</p></div>
                  <div className="rounded-xl bg-[#F8FAF9] p-2"><p className="text-sm font-bold capitalize">{o.competition}</p><p className="text-[11px] text-nexora-muted">competition</p></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-nexora-muted">No opportunity signal is available yet.</p>
        )}
      </section>

      <section className="rounded-2xl border border-nexora-border bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <BadgeDollarSign className="text-nexora-amber" size={20} />
          <h2 className="font-extrabold text-nexora-ink">Your products vs Nexora pricing</h2>
        </div>
        {data?.pricing_benchmarks?.length ? (
          <div className="divide-y divide-nexora-border">
            {data.pricing_benchmarks.map((p) => (
              <div key={p.product_id} className="grid gap-2 py-3 text-sm sm:grid-cols-4 sm:items-center">
                <div><p className="font-semibold text-nexora-ink">{p.title}</p><p className="text-xs text-nexora-muted">{p.category}</p></div>
                <div><span className="text-nexora-muted">You:</span> <b>{money(p.your_price)}</b></div>
                <div><span className="text-nexora-muted">Market median:</span> <b>{money(p.market_median)}</b></div>
                <div className={`font-bold ${p.signal === "aligned" ? "text-nexora-emerald" : "text-nexora-amber"}`}>{p.difference_pct > 0 ? "+" : ""}{p.difference_pct}% · {p.signal}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-7 text-center text-sm text-nexora-muted">Pricing appears after Nexora has at least 3 comparable products from at least 2 other stores.</p>
        )}
      </section>

      <section className="rounded-2xl border border-nexora-border bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="text-nexora-amber" size={20} />
          <div>
            <h2 className="font-extrabold text-nexora-ink">Ask Nexora Intelligence</h2>
            <p className="text-xs text-nexora-muted">Continuous chat about demand, price, stock and marketplace expansion.</p>
          </div>
        </div>
        <div className="mb-3 max-h-72 space-y-2 overflow-y-auto rounded-2xl bg-[#F8FAF9] p-3">
          {messages.length === 0 && <p className="text-sm text-nexora-muted">Try: “What should I restock?”, “Am I expensive?”, or “Which category should I expand into?”</p>}
          {messages.map((m, index) => (
            <div key={index} className={`max-w-[90%] rounded-xl px-3 py-2 text-sm leading-6 ${m.role === "user" ? "ml-auto bg-[#6D4BE8] text-white" : "bg-white text-nexora-ink"}`}>{m.text}</div>
          ))}
          {asking && <div className="max-w-[90%] rounded-xl bg-white px-3 py-2 text-sm text-nexora-muted">Analyzing live Nexora data…</div>}
        </div>
        <form onSubmit={ask} className="flex flex-col gap-2 sm:flex-row">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-nexora-border px-4 py-3 text-sm outline-none focus:border-nexora-emerald" placeholder="Ask about demand, price, stock or expansion…" />
          <button disabled={asking || !question.trim()} className="nx-btn-primary justify-center"><Send size={15} /> Send</button>
        </form>
      </section>

      {data?.low_stock?.length > 0 && (
        <section className="rounded-2xl border border-nexora-border bg-white p-5">
          <div className="mb-3 flex items-center gap-2"><Boxes className="text-nexora-coral" size={20} /><h2 className="font-extrabold text-nexora-ink">Restock attention</h2></div>
          <div className="flex flex-wrap gap-2">
            {data.low_stock.map((p) => <span key={p.id} className="rounded-full bg-[#FFEDE5] px-3 py-1.5 text-xs font-semibold text-nexora-coral">{p.title} · {p.stock} left</span>)}
          </div>
        </section>
      )}

      <p className="text-xs text-nexora-muted">{data?.privacy} Data basis: {data?.data_window}. Signals are directional, not guaranteed forecasts.</p>
    </div>
  );
}
