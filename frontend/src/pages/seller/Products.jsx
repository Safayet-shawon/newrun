import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Edit, Trash2, Eye, EyeOff, CheckSquare, Square } from "lucide-react";
import { api, resolveImage } from "@/lib/api";
import { Loader, EmptyState, Badge } from "@/components/shared/Bits";
import { useSeller } from "@/context/SellerContext";
import { formatBDT, effectivePrice } from "@/lib/format";
import LockGate from "@/components/seller/LockGate";
import { toast } from "sonner";

export default function Products() {
  const { ent } = useSeller();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState([]);

  const load = useCallback(() => {
    const params = {};
    if (q) params.search = q;
    if (status) params.status = status;
    api.get("/seller/products", { params }).then(({ data }) => setItems(data.items));
  }, [q, status]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const del = async (id) => { if (!window.confirm("Delete this product?")) return; await api.delete(`/seller/products/${id}`); toast.success("Deleted"); load(); };
  const toggleSel = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const bulk = async (action) => {
    if (!selected.length) return;
    try { await api.post("/seller/products/bulk", { product_ids: selected, action }); toast.success("Bulk action applied"); setSelected([]); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-nexora-ink">Products</h1>
        <Link to="/seller/dashboard/products/new" className="nx-btn-primary" data-testid="add-product-btn"><Plus size={16} /> Add product</Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="h-11 w-full rounded-full border border-nexora-border bg-white pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" data-testid="product-search" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 rounded-full border border-nexora-border bg-white px-4 text-sm" data-testid="product-status-filter">
          <option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option>
        </select>
      </div>

      {/* bulk bar */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-nexora-emerald/30 bg-nexora-mintbg p-3" data-testid="bulk-bar">
          <span className="text-sm font-semibold text-nexora-ink">{selected.length} selected</span>
          {ent?.bulk_management ? (
            <div className="flex gap-2">
              <button onClick={() => bulk("publish")} className="nx-btn-ghost py-1.5" data-testid="bulk-publish">Publish</button>
              <button onClick={() => bulk("unpublish")} className="nx-btn-ghost py-1.5">Unpublish</button>
              <button onClick={() => bulk("delete")} className="rounded-full bg-nexora-coral px-4 py-1.5 text-sm font-semibold text-white">Delete</button>
            </div>
          ) : <LockGate feature="bulk_management" entitlements={ent} inline />}
        </div>
      )}

      {!items ? <Loader /> : items.length === 0 ? (
        <EmptyState title="No products yet" description="Add your first product to start selling." action={<Link to="/seller/dashboard/products/new" className="nx-btn-primary mt-2"><Plus size={16} /> Add product</Link>} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-nexora-border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-nexora-border bg-nexora-warm text-left text-xs font-semibold uppercase tracking-wide text-nexora-muted">
              <tr>
                <th className="w-10 p-3"></th>
                <th className="p-3">Product</th>
                <th className="hidden p-3 sm:table-cell">Price</th>
                <th className="hidden p-3 md:table-cell">Stock</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nexora-border">
              {items.map((p) => (
                <tr key={p.id} data-testid={`product-row-${p.id}`}>
                  <td className="p-3"><button onClick={() => toggleSel(p.id)} data-testid={`select-${p.id}`}>{selected.includes(p.id) ? <CheckSquare size={18} className="text-nexora-emerald" /> : <Square size={18} className="text-nexora-muted" />}</button></td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <img src={resolveImage(p.images?.[0])} alt="" className="h-11 w-11 rounded-lg object-cover" />
                      <div className="min-w-0"><p className="line-clamp-1 font-semibold text-nexora-ink">{p.title}</p><p className="text-xs text-nexora-muted">{p.sku}</p></div>
                    </div>
                  </td>
                  <td className="hidden p-3 font-medium sm:table-cell">{formatBDT(effectivePrice(p))}</td>
                  <td className="hidden p-3 md:table-cell">{p.stock === 0 ? <Badge tone="coral">Out</Badge> : p.stock <= 5 ? <Badge tone="amber">{p.stock} left</Badge> : <span>{p.stock}</span>}</td>
                  <td className="p-3">{p.status === "published" ? <Badge tone="emerald">Published</Badge> : <Badge tone="muted">Draft</Badge>}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Link to={`/seller/dashboard/products/${p.id}/edit`} className="grid h-8 w-8 place-items-center rounded-lg text-nexora-muted hover:bg-nexora-mintbg hover:text-nexora-emerald" data-testid={`edit-${p.id}`}><Edit size={16} /></Link>
                      <button onClick={() => del(p.id)} className="grid h-8 w-8 place-items-center rounded-lg text-nexora-muted hover:bg-[#FFEDE5] hover:text-nexora-coral" data-testid={`delete-${p.id}`}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
