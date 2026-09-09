import React, { useEffect, useState } from "react";
import {
  Sparkles,
  TrendingUp,
  Gauge,
  BadgeDollarSign,
  Boxes,
  ShieldCheck,
  ArrowRight,
  Send,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import LockGate from "@/components/seller/LockGate";
import { useSeller } from "@/context/SellerContext";

const money = (v) => `৳${Number(v || 0).toLocaleString()}`;

function Score({ value }) {
  const score = Number(value || 0);
  return (
    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#FFF7E6] text-lg font-extrabold text-nexora-amber">
      {score}
    </div>
  );
}

export default function Intelligence() {
  const { ent } = useSeller();
  const allowed = !!ent?.marketplace_intelligence;
  const [data, setData] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    api.get("/seller/intelligence/overview").then(({ data }) => setData(data));
  }, [allowed]);

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

  if (!data) return <Loader label="Building marketplace intelligence" />;

  const ask = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    try {
      const { data } = await api.post("/seller/intelligence/ask", { question });
      setAnswer(data.answer);
    } finally {
      setAsking(false);
    }
  };

  const top = data.opportunities?.[0];

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
              See demand, supply gaps, anonymous pricing benchmarks and opportunities matched to your current catalogue.
            </p>
          </div>
          <Link to="/seller/dashboard/import-store" className="nx-btn-primary whitespace-nowrap">
            Import existing store <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-nexora-border bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-nexora-muted">Best opportunity</p>
              <p className="mt-2 text-xl font-extrabold text-nexora-ink">{top?.category || "Not enough data yet"}</p>
              <p className="mt-1 text-sm text-nexora-muted">
                {top ? `${top.competition} competition · ${top.confidence} confidence` : "Keep collecting marketplace activity"}
              </p>
            </div>
            <Score value={top?.opportunity_score} />
          </div>
        </div>

        <div className="rounded-2xl border border-nexora-border bg-white p-5">
          <Gauge className="text-nexora-emerald" size={22} />
          <p className="mt-3 text-2xl font-extrabold text-nexora-ink">{data.marketplace_summary?.published_products || 0}</p>
          <p className="text-sm text-nexora-muted">Published products measured</p>
        </div>

        <div className="rounded-2xl border border-nexora-border bg-white p-5">
          <ShieldCheck className="text-nexora-emerald" size={22} />
          <p className="mt-3 font-extrabold text-nexora-ink">Privacy-safe benchmarks</p>
          <p className="mt-1 text-sm text-nexora-muted">No named competitor revenue or private order totals are exposed.</p>
        </div>
      </div>

      <section className="rounded-2xl border border-nexora-border bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="text-nexora-emerald" size={20} />
          <h2 className="font-extrabold text-nexora-ink">Marketplace demand opportunities</h2>
        </div>
        {data.opportunities?.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.opportunities.map((o) => (
              <div key={o.category} className="rounded-2xl border border-nexora-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-nexora-ink">{o.category}</p>
                    <p className="text-xs text-nexora-muted">
                      Demand {o.demand_score}/100 · {o.seller_count} seller(s) · {o.product_count} product(s)
                    </p>
                  </div>
                  <span className="rounded-full bg-nexora-mintbg px-3 py-1 text-xs font-extrabold text-nexora-emerald">
                    Opportunity {o.opportunity_score}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-[#F8FAF9] p-2">
                    <p className="text-sm font-bold text-nexora-ink">{o.recent_units_14d}</p>
                    <p className="text-[11px] text-nexora-muted">units / 14d</p>
                  </div>
                  <div className="rounded-xl bg-[#F8FAF9] p-2">
                    <p className="text-sm font-bold text-nexora-ink">{o.demand_change_pct > 0 ? "+" : ""}{o.demand_change_pct}%</p>
                    <p className="text-[11px] text-nexora-muted">trend</p>
                  </div>
                  <div className="rounded-xl bg-[#F8FAF9] p-2">
                    <p className="text-sm font-bold capitalize text-nexora-ink">{o.competition}</p>
                    <p className="text-[11px] text-nexora-muted">competition</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-nexora-muted">Not enough matching marketplace activity yet.</p>
        )}
      </section>

      <section className="rounded-2xl border border-nexora-border bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <BadgeDollarSign className="text-nexora-amber" size={20} />
          <h2 className="font-extrabold text-nexora-ink">Your products vs Nexora pricing</h2>
        </div>
        {data.pricing_benchmarks?.length ? (
          <div className="divide-y divide-nexora-border">
            {data.pricing_benchmarks.map((p) => (
              <div key={p.product_id} className="grid gap-2 py-3 text-sm sm:grid-cols-4 sm:items-center">
                <div>
                  <p className="font-semibold text-nexora-ink">{p.title}</p>
                  <p className="text-xs text-nexora-muted">{p.category}</p>
                </div>
                <div><span className="text-nexora-muted">You:</span> <b>{money(p.your_price)}</b></div>
                <div><span className="text-nexora-muted">Market median:</span> <b>{money(p.market_median)}</b></div>
                <div className={`font-bold ${p.signal === "aligned" ? "text-nexora-emerald" : "text-nexora-amber"}`}>
                  {p.difference_pct > 0 ? "+" : ""}{p.difference_pct}% · {p.signal}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-7 text-center text-sm text-nexora-muted">
            Nexora needs at least 3 comparable products from at least 2 other stores before showing a benchmark.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-nexora-border bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="text-nexora-amber" size={20} />
          <div>
            <h2 className="font-extrabold text-nexora-ink">Ask Nexora AI</h2>
            <p className="text-xs text-nexora-muted">Ask about demand, pricing, products or stock using your live Nexora data.</p>
          </div>
        </div>
        <form onSubmit={ask} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-nexora-border px-4 py-3 text-sm outline-none focus:border-nexora-emerald"
            placeholder="Example: Which of my product categories has the best demand?"
          />
          <button disabled={asking} className="nx-btn-primary justify-center">
            <Send size={15} /> {asking ? "Analyzing..." : "Ask"}
          </button>
        </form>
        {answer && (
          <div className="mt-4 rounded-2xl bg-nexora-mintbg p-4 text-sm leading-6 text-nexora-ink">
            {answer}
          </div>
        )}
      </section>

      {data.low_stock?.length > 0 && (
        <section className="rounded-2xl border border-nexora-border bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Boxes className="text-nexora-coral" size={20} />
            <h2 className="font-extrabold text-nexora-ink">Restock attention</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.low_stock.map((p) => (
              <span key={p.id} className="rounded-full bg-[#FFEDE5] px-3 py-1.5 text-xs font-semibold text-nexora-coral">
                {p.title} · {p.stock} left
              </span>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-nexora-muted">
        {data.privacy} Data window: {data.data_window}. Low-confidence signals are directional, not guaranteed forecasts.
      </p>
    </div>
  );
}
