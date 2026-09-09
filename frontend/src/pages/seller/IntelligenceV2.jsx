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
  RefreshCw,
  AlertTriangle,
  MessageCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import LockGate from "@/components/seller/LockGate";
import { useSeller } from "@/context/SellerContext";
import { toast } from "sonner";

const money = (v) => `৳${Number(v || 0).toLocaleString()}`;

function Score({ value }) {
  const score = Number(value || 0);
  return (
    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#FFF7E6] text-lg font-extrabold text-nexora-amber">
      {score}
    </div>
  );
}

export default function IntelligenceV2() {
  const { ent } = useSeller();
  const allowed = !!ent?.marketplace_intelligence;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [chat, setChat] = useState([]);

  const load = async () => {
    if (!allowed) return;
    setLoading(true);
    setLoadError("");
    try {
      const { data } = await api.get("/seller/intelligence/overview");
      setData(data);
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        err.message ||
        "Could not build marketplace intelligence";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const ask = async (e) => {
    e?.preventDefault();
    const text = question.trim();
    if (!text) return;
    setQuestion("");
    const optimistic = {
      id: `user-${Date.now()}`,
      role: "user",
      message: text,
    };
    setChat((prev) => [...prev, optimistic]);
    setAsking(true);
    try {
      const { data } = await api.post("/seller/intelligence/ask", {
        question: text,
      });
      setChat((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          message: data.answer,
        },
      ]);
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        "Nexora Intelligence could not answer right now";
      setChat((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          message,
          error: true,
        },
      ]);
    } finally {
      setAsking(false);
    }
  };

  const top = data?.opportunities?.[0];
  const recommendations = data?.recommendations || [];
  const marketRows = data?.market_opportunities || [];

  if (!allowed) {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-nexora-amber">
            PRO
          </p>
          <h1 className="text-2xl font-extrabold text-nexora-ink">
            Nexora Intelligence
          </h1>
          <p className="text-sm text-nexora-muted">
            Marketplace-wide demand, supply and pricing intelligence.
          </p>
        </div>
        <LockGate feature="marketplace_intelligence" entitlements={ent} />
      </div>
    );
  }

  if (loading && !data) return <Loader label="Building marketplace intelligence" />;

  if (loadError && !data) {
    return (
      <div className="rounded-2xl border border-nexora-coral/30 bg-white p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 text-nexora-coral" size={22} />
          <div>
            <h1 className="text-xl font-extrabold text-nexora-ink">
              Intelligence could not load
            </h1>
            <p className="mt-1 text-sm text-nexora-muted">{loadError}</p>
            <button onClick={load} className="nx-btn-primary mt-4">
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-nexora-amber/30 bg-gradient-to-br from-[#FFF9ED] via-white to-[#ECFDF5] p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#FFF1CC] px-3 py-1 text-xs font-extrabold text-[#A96D00]">
              <Sparkles size={14} /> PRO · NEXORA INTELLIGENCE
            </div>
            <h1 className="text-3xl font-extrabold text-nexora-ink">
              Know what the marketplace is telling you.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-nexora-muted">
              Live Nexora catalogue/order signals, supply gaps, privacy-safe
              pricing benchmarks and recommendations matched to your current
              store.
            </p>
            <div className="mt-3 inline-flex rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-nexora-muted">
              Signal mode:{" "}
              {data.signal_mode === "recent_orders"
                ? "recent marketplace orders + history"
                : "historical catalogue fallback until more recent orders arrive"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={load} disabled={loading} className="nx-btn-ghost">
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <Link
              to="/seller/dashboard/import-store"
              className="nx-btn-primary whitespace-nowrap"
            >
              Import existing store <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-nexora-border bg-white p-5 md:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-nexora-muted">
                Best matched opportunity
              </p>
              <p className="mt-2 text-xl font-extrabold text-nexora-ink">
                {top?.category || "Not enough data yet"}
              </p>
              <p className="mt-1 text-sm text-nexora-muted">
                {top
                  ? `${top.competition} competition · ${top.confidence} confidence · ${top.activity_basis}`
                  : "Keep collecting marketplace activity"}
              </p>
            </div>
            <Score value={top?.opportunity_score} />
          </div>
        </div>

        <div className="rounded-2xl border border-nexora-border bg-white p-5">
          <Gauge className="text-nexora-emerald" size={22} />
          <p className="mt-3 text-2xl font-extrabold text-nexora-ink">
            {data.marketplace_summary?.published_products || 0}
          </p>
          <p className="text-sm text-nexora-muted">Published products measured</p>
        </div>

        <div className="rounded-2xl border border-nexora-border bg-white p-5">
          <ShieldCheck className="text-nexora-emerald" size={22} />
          <p className="mt-3 text-2xl font-extrabold text-nexora-ink">
            {data.marketplace_summary?.categories_measured || 0}
          </p>
          <p className="text-sm text-nexora-muted">Marketplace categories measured</p>
        </div>
      </div>

      {recommendations.length > 0 && (
        <section className="rounded-2xl border border-nexora-border bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="text-nexora-amber" size={20} />
            <h2 className="font-extrabold text-nexora-ink">
              What Nexora recommends now
            </h2>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {recommendations.map((item, index) => (
              <div
                key={`${item.type}-${index}`}
                className="rounded-2xl bg-[#FAFCFB] p-4"
              >
                <p className="text-xs font-bold uppercase tracking-wide text-nexora-muted">
                  {item.type}
                </p>
                <p className="mt-1 font-extrabold text-nexora-ink">
                  {item.title}
                </p>
                <p className="mt-2 text-xs leading-5 text-nexora-muted">
                  {item.message}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-nexora-border bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="text-nexora-emerald" size={20} />
          <div>
            <h2 className="font-extrabold text-nexora-ink">
              Opportunities matched to your catalogue
            </h2>
            <p className="text-xs text-nexora-muted">
              These are prioritized around categories you already sell where possible.
            </p>
          </div>
        </div>

        {data.opportunities?.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.opportunities.map((o) => (
              <Opportunity key={`own-${o.category}`} row={o} />
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-nexora-muted">
            No matched category signal yet.
          </p>
        )}
      </section>

      {marketRows.length > 0 && (
        <section className="rounded-2xl border border-nexora-border bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Gauge className="text-[#6A4FD6]" size={20} />
            <div>
              <h2 className="font-extrabold text-nexora-ink">
                Wider marketplace signals
              </h2>
              <p className="text-xs text-nexora-muted">
                Useful when you are considering a new category.
              </p>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {marketRows.slice(0, 6).map((o) => (
              <Opportunity key={`market-${o.category}`} row={o} />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-nexora-border bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <BadgeDollarSign className="text-nexora-amber" size={20} />
          <h2 className="font-extrabold text-nexora-ink">
            Your products vs Nexora pricing
          </h2>
        </div>

        {data.pricing_benchmarks?.length ? (
          <div className="divide-y divide-nexora-border">
            {data.pricing_benchmarks.map((p) => (
              <div
                key={p.product_id}
                className="grid gap-2 py-3 text-sm sm:grid-cols-4 sm:items-center"
              >
                <div>
                  <p className="font-semibold text-nexora-ink">{p.title}</p>
                  <p className="text-xs text-nexora-muted">{p.category}</p>
                </div>
                <div>
                  <span className="text-nexora-muted">You:</span>{" "}
                  <b>{money(p.your_price)}</b>
                </div>
                <div>
                  <span className="text-nexora-muted">Market median:</span>{" "}
                  <b>{money(p.market_median)}</b>
                </div>
                <div
                  className={`font-bold ${
                    p.signal === "aligned"
                      ? "text-nexora-emerald"
                      : "text-nexora-amber"
                  }`}
                >
                  {p.difference_pct > 0 ? "+" : ""}
                  {p.difference_pct}% · {p.signal}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-7 text-center text-sm text-nexora-muted">
            Nexora needs at least 3 comparable products from at least 2 other
            stores before showing a privacy-safe price benchmark.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-nexora-border bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <MessageCircle className="text-[#6A4FD6]" size={20} />
          <div>
            <h2 className="font-extrabold text-nexora-ink">
              Ask Nexora Intelligence
            </h2>
            <p className="text-xs text-nexora-muted">
              Continuous chat about demand, pricing, stock or marketplace expansion.
            </p>
          </div>
        </div>

        <div className="mb-3 max-h-[360px] space-y-2 overflow-y-auto rounded-2xl bg-[#FAFCFB] p-3">
          {!chat.length && (
            <div className="rounded-xl bg-white p-3 text-xs leading-5 text-nexora-muted">
              Ask: “What should I sell next?”, “How is my pricing?”, “What
              should I restock?”, or “Which marketplace category looks strongest?”
            </div>
          )}
          {chat.map((message) => (
            <div
              key={message.id}
              className={`rounded-xl p-3 text-sm leading-6 ${
                message.role === "user"
                  ? "ml-10 bg-[#6A4FD6] text-white"
                  : message.error
                    ? "mr-6 bg-[#FFEDE5] text-nexora-coral"
                    : "mr-6 bg-white text-nexora-ink"
              }`}
            >
              {message.message}
            </div>
          ))}
          {asking && (
            <div className="mr-6 rounded-xl bg-white p-3 text-sm text-nexora-muted">
              Analyzing live Nexora signals…
            </div>
          )}
        </div>

        <form onSubmit={ask} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-nexora-border px-4 py-3 text-sm outline-none focus:border-nexora-emerald"
            placeholder="Ask about demand, pricing, stock or marketplace opportunities..."
          />
          <button
            disabled={asking || !question.trim()}
            className="nx-btn-primary justify-center"
          >
            <Send size={15} /> {asking ? "Analyzing..." : "Ask"}
          </button>
        </form>
      </section>

      {data.low_stock?.length > 0 && (
        <section className="rounded-2xl border border-nexora-border bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Boxes className="text-nexora-coral" size={20} />
            <h2 className="font-extrabold text-nexora-ink">
              Restock attention
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.low_stock.map((p) => (
              <span
                key={p.id}
                className="rounded-full bg-[#FFEDE5] px-3 py-1.5 text-xs font-semibold text-nexora-coral"
              >
                {p.title} · {p.stock} left
              </span>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs leading-5 text-nexora-muted">
        {data.privacy} Signal basis: {data.data_window}. These are directional
        business signals, not guaranteed forecasts.
      </p>
    </div>
  );
}

function Opportunity({ row }) {
  return (
    <div className="rounded-2xl border border-nexora-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold capitalize text-nexora-ink">{row.category}</p>
          <p className="text-xs text-nexora-muted">
            Demand {row.demand_score}/100 · {row.seller_count} seller(s) ·{" "}
            {row.product_count} product(s)
          </p>
        </div>
        <span className="rounded-full bg-nexora-mintbg px-3 py-1 text-xs font-extrabold text-nexora-emerald">
          Opportunity {row.opportunity_score}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-[#F8FAF9] p-2">
          <p className="text-sm font-bold text-nexora-ink">
            {row.recent_units_14d}
          </p>
          <p className="text-[11px] text-nexora-muted">recent units</p>
        </div>
        <div className="rounded-xl bg-[#F8FAF9] p-2">
          <p className="text-sm font-bold text-nexora-ink">
            {row.demand_change_pct > 0 ? "+" : ""}
            {row.demand_change_pct}%
          </p>
          <p className="text-[11px] text-nexora-muted">trend</p>
        </div>
        <div className="rounded-xl bg-[#F8FAF9] p-2">
          <p className="text-sm font-bold capitalize text-nexora-ink">
            {row.competition}
          </p>
          <p className="text-[11px] text-nexora-muted">competition</p>
        </div>
      </div>
    </div>
  );
}
