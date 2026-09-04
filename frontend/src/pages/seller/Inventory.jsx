import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Package, Edit } from "lucide-react";
import { api } from "@/lib/api";
import { Loader, EmptyState, Badge } from "@/components/shared/Bits";
import { formatBDT } from "@/lib/format";

export default function Inventory() {
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState("all");
  useEffect(() => { api.get("/seller/products", { params: { sort: "stock_low" } }).then(({ data }) => setItems(data.items)); }, []);
  if (!items) return <Loader />;

  const filtered = items.filter((p) => tab === "all" ? true : tab === "out" ? p.stock === 0 : p.stock > 0 && p.stock <= 5);
  const outCount = items.filter((p) => p.stock === 0).length;
  const lowCount = items.filter((p) => p.stock > 0 && p.stock <= 5).length;
  const totalUnits = items.reduce((n, p) => n + (p.stock || 0), 0);

  const stats = [
    { label: "Total SKUs", value: items.length, tone: "text-nexora-ink" },
    { label: "Units in stock", value: totalUnits, tone: "text-nexora-emerald" },
    { label: "Low stock", value: lowCount, tone: "text-nexora-amber" },
    { label: "Out of stock", value: outCount, tone: "text-nexora-coral" },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-nexora-ink">Inventory</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-nexora-border bg-white p-5">
            <p className={`text-2xl font-extrabold ${s.tone}`}>{s.value}</p><p className="text-sm text-nexora-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {[["all", "All"], ["low", `Low (${lowCount})`], ["out", `Out (${outCount})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-medium ${tab === k ? "bg-nexora-emerald text-white" : "border border-nexora-border bg-white"}`} data-testid={`inv-tab-${k}`}>{l}</button>
        ))}
      </div>

      {filtered.length === 0 ? <EmptyState icon={Package} title="Nothing here" description="No products in this view." /> : (
        <div className="overflow-hidden rounded-2xl border border-nexora-border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-nexora-border bg-nexora-warm text-left text-xs font-semibold uppercase tracking-wide text-nexora-muted">
              <tr><th className="p-3">Product</th><th className="p-3">Price</th><th className="p-3">Stock</th><th className="p-3 text-right">Edit</th></tr>
            </thead>
            <tbody className="divide-y divide-nexora-border">
              {filtered.map((p) => (
                <tr key={p.id} data-testid={`inv-row-${p.id}`}>
                  <td className="p-3 font-medium text-nexora-ink">{p.title}</td>
                  <td className="p-3">{formatBDT(p.price)}</td>
                  <td className="p-3">{p.stock === 0 ? <Badge tone="coral"><AlertTriangle size={11} /> Out of stock</Badge> : p.stock <= 5 ? <Badge tone="amber"><AlertTriangle size={11} /> {p.stock} left</Badge> : <Badge tone="emerald">{p.stock} in stock</Badge>}</td>
                  <td className="p-3 text-right"><Link to={`/seller/dashboard/products/${p.id}/edit`} className="inline-grid h-8 w-8 place-items-center rounded-lg text-nexora-muted hover:bg-nexora-mintbg hover:text-nexora-emerald"><Edit size={16} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
