import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import { useSeller } from "@/context/SellerContext";
import LockGate from "@/components/seller/LockGate";
import { formatBDT } from "@/lib/format";
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip, CartesianGrid } from "recharts";

export default function Analytics() {
  const { ent } = useSeller();
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/seller/overview").then(({ data }) => setData(data)); }, []);
  if (!data) return <Loader />;

  const m = data.metrics;
  // Simple demo chart derived from products/orders counts
  const chart = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => ({ day: d, views: Math.round((m.products || 5) * (4 + Math.sin(i) * 3 + i)) }));

  const cards = [
    { label: "Total revenue", value: formatBDT(m.revenue || 0) },
    { label: "Total orders", value: m.orders || 0 },
    { label: "Products live", value: m.published || 0 },
    { label: "Avg. rating", value: (m.rating || 0).toFixed(1) },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-nexora-ink">Analytics</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => <div key={c.label} className="rounded-2xl border border-nexora-border bg-white p-5"><p className="text-2xl font-extrabold text-nexora-ink">{c.value}</p><p className="text-sm text-nexora-muted">{c.label}</p></div>)}
      </div>

      <div className="rounded-2xl border border-nexora-border bg-white p-5">
        <h3 className="mb-4 font-bold text-nexora-ink">Store visits this week</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7EEE9" vertical={false} />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#66736B", fontSize: 12 }} />
              <Tooltip cursor={{ fill: "#ECFDF5" }} contentStyle={{ borderRadius: 12, border: "1px solid #E7EEE9" }} />
              <Bar dataKey="views" fill="#10B981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-bold text-nexora-ink">Advanced analytics</h3>
        <LockGate feature="advanced_analytics" entitlements={ent} />
      </div>
    </div>
  );
}
