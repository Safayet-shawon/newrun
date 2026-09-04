import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Loader, EmptyState } from "@/components/shared/Bits";
import { useSeller } from "@/context/SellerContext";
import LockGate from "@/components/seller/LockGate";
import { formatBDT } from "@/lib/format";
import { Users } from "lucide-react";

export default function Customers() {
  const { ent } = useSeller();
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/seller/customers").then(({ data }) => setRows(data)); }, []);
  if (!rows) return <Loader />;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-nexora-ink">Customers</h1>
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No customers yet" description="Customers who order from your shop will appear here." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-nexora-border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-nexora-border bg-nexora-warm text-left text-xs font-semibold uppercase tracking-wide text-nexora-muted">
              <tr><th className="p-3">Customer</th><th className="p-3">Orders</th><th className="p-3">Total spent</th></tr>
            </thead>
            <tbody className="divide-y divide-nexora-border">
              {rows.map((c, i) => (
                <tr key={i}><td className="p-3"><p className="font-semibold text-nexora-ink">{c.name}</p><p className="text-xs text-nexora-muted">{c.email}</p></td><td className="p-3">{c.orders}</td><td className="p-3 font-bold">{formatBDT(c.spent)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h3 className="mb-3 font-bold text-nexora-ink">Customer insights</h3>
        <LockGate feature="customer_insights" entitlements={ent} />
      </div>
    </div>
  );
}
