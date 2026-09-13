import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import { formatBDT } from "@/lib/format";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ShoppingBag, PackageCheck, ReceiptText, TrendingUp } from "lucide-react";

const PERIODS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

const periodTitle = {
  daily: "Last 24 hours",
  weekly: "Last 7 days",
  monthly: "Last 30 days",
  yearly: "Last 12 months",
};

export default function Analytics() {
  const [period, setPeriod] = useState("weekly");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get("/seller/analytics", { params: { period } })
      .then(({ data: response }) => { if (active) setData(response); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period]);

  if (!data && loading) return <Loader label="Loading sales analytics" />;

  const summary = data?.summary || {};
  const cards = [
    { icon: TrendingUp, label: "Revenue", value: formatBDT(summary.revenue || 0), tone: "bg-nexora-mintbg text-nexora-emerald" },
    { icon: ShoppingBag, label: "Orders", value: summary.orders || 0, tone: "bg-[#EEF4FF] text-[#3B82F6]" },
    { icon: PackageCheck, label: "Items sold", value: summary.items_sold || 0, tone: "bg-[#FEF3E2] text-nexora-amber" },
    { icon: ReceiptText, label: "Average order", value: formatBDT(summary.average_order || 0), tone: "bg-[#FFEDE5] text-nexora-coral" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-nexora-emerald">Real sales data</p>
          <h1 className="mt-1 text-2xl font-extrabold text-nexora-ink">Revenue & sales</h1>
          <p className="mt-1 text-sm text-nexora-muted">Cancelled and refunded orders are excluded.</p>
        </div>
        <div className="flex overflow-x-auto rounded-xl border border-nexora-border bg-white p-1">
          {PERIODS.map((item) => (
            <button key={item.id} onClick={() => setPeriod(item.id)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition ${period === item.id ? "bg-nexora-emerald text-white shadow-sm" : "text-nexora-muted hover:bg-nexora-mintbg"}`}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-nexora-border bg-white p-4 sm:p-5">
            <div className={`grid h-9 w-9 place-items-center rounded-xl ${card.tone}`}><card.icon size={17} /></div>
            <p className="mt-3 text-xl font-extrabold text-nexora-ink sm:text-2xl">{card.value}</p>
            <p className="text-xs text-nexora-muted sm:text-sm">{card.label}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-nexora-border bg-white p-4 sm:p-5">
        <div className="mb-5 flex items-center justify-between">
          <div><h2 className="font-bold text-nexora-ink">Sales performance</h2><p className="text-xs text-nexora-muted">{periodTitle[period]}</p></div>
          {loading && <span className="text-xs font-semibold text-nexora-emerald">Updating…</span>}
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.series || []} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10B981" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7EEE9" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={18} tick={{ fill: "#66736B", fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} width={58} tick={{ fill: "#66736B", fontSize: 11 }} tickFormatter={(value) => `৳${Number(value).toLocaleString()}`} />
              <Tooltip cursor={{ stroke: "#2DD4BF", strokeDasharray: "4 4" }} contentStyle={{ borderRadius: 14, border: "1px solid #E7EEE9", boxShadow: "0 12px 32px rgba(23,33,27,.08)" }} formatter={(value, name) => name === "revenue" ? [formatBDT(value), "Revenue"] : [value, name]} />
              <Area type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={3} fill="url(#revenueFill)" activeDot={{ r: 5, fill: "#10B981" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
