import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Plus, X } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import { useSeller } from "@/context/SellerContext";
import ImageUpload from "@/components/seller/ImageUpload";
import { toast } from "sonner";

const BLANK = { title: "", description: "", category: "", brand: "", sku: "", price: "", discount_price: "", images: [], variants: [], attributes: [], stock: 0, status: "draft", tags: [], specs: {}, is_featured: false };

export default function ProductForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const { shop } = useSeller();
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/categories").then(({ data }) => setCats(data));
    if (editing) {
      api.get("/seller/products").then(({ data }) => {
        const p = data.items.find((x) => x.id === id);
        if (p) setForm({ ...BLANK, ...p, discount_price: p.discount_price ?? "" });
        setLoading(false);
      });
    }
  }, [editing, id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (statusOverride) => {
    if (!form.title || !form.price) { toast.error("Title and price are required"); return; }
    setSaving(true);
    const payload = {
      ...form,
      price: Number(form.price),
      discount_price: form.discount_price === "" ? null : Number(form.discount_price),
      stock: Number(form.stock) || 0,
      category: form.category || shop?.category,
      status: statusOverride || form.status,
      tags: typeof form.tags === "string" ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : form.tags,
    };
    try {
      if (editing) await api.put(`/seller/products/${id}`, payload);
      else await api.post("/seller/products", payload);
      toast.success(editing ? "Product updated" : "Product created");
      navigate("/seller/dashboard/products");
    } catch (e) { toast.error(formatApiError(e)); } finally { setSaving(false); }
  };

  if (loading) return <Loader />;

  return (
    <div className="max-w-3xl space-y-5">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-nexora-muted hover:text-nexora-ink"><ArrowLeft size={15} /> Back</button>
      <h1 className="text-2xl font-extrabold text-nexora-ink">{editing ? "Edit product" : "Add product"}</h1>

      <div className="space-y-5 rounded-2xl border border-nexora-border bg-white p-6" data-testid="product-form">
        <Field label="Product title"><input value={form.title} onChange={(e) => set("title", e.target.value)} className="inp" data-testid="pf-title" /></Field>
        <Field label="Description"><textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} className="inp" data-testid="pf-description" /></Field>

        <ImageUpload multiple label="Product images" values={form.images} onChangeMulti={(v) => set("images", v)} testid="pf-images" />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className="inp" data-testid="pf-category">
              <option value="">{shop?.category || "Select"}</option>
              {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Brand"><input value={form.brand} onChange={(e) => set("brand", e.target.value)} className="inp" data-testid="pf-brand" /></Field>
          <Field label="SKU"><input value={form.sku} onChange={(e) => set("sku", e.target.value)} className="inp" data-testid="pf-sku" /></Field>
          <Field label="Stock quantity"><input type="number" value={form.stock} onChange={(e) => set("stock", e.target.value)} className="inp" data-testid="pf-stock" /></Field>
          <Field label="Price (৳)"><input type="number" value={form.price} onChange={(e) => set("price", e.target.value)} className="inp" data-testid="pf-price" /></Field>
          <Field label="Discount price (৳) — optional"><input type="number" value={form.discount_price} onChange={(e) => set("discount_price", e.target.value)} className="inp" data-testid="pf-discount" /></Field>
        </div>

        <Field label="Tags (comma separated)"><input value={Array.isArray(form.tags) ? form.tags.join(", ") : form.tags} onChange={(e) => set("tags", e.target.value)} className="inp" data-testid="pf-tags" /></Field>

        {/* Variants */}
        <div>
          <div className="mb-2 flex items-center justify-between"><label className="text-sm font-medium text-nexora-ink">Variants</label>
            <button type="button" onClick={() => set("variants", [...form.variants, { name: "", options: [] }])} className="text-sm font-medium text-nexora-emerald" data-testid="pf-add-variant"><Plus size={14} className="inline" /> Add variant</button>
          </div>
          {form.variants.map((v, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <input value={v.name} onChange={(e) => { const nv = [...form.variants]; nv[i] = { ...v, name: e.target.value }; set("variants", nv); }} placeholder="Name (e.g. Size)" className="inp flex-1" />
              <input value={(v.options || []).join(", ")} onChange={(e) => { const nv = [...form.variants]; nv[i] = { ...v, options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }; set("variants", nv); }} placeholder="Options (S, M, L)" className="inp flex-[2]" />
              <button type="button" onClick={() => set("variants", form.variants.filter((_, idx) => idx !== i))} className="text-nexora-coral"><X size={18} /></button>
            </div>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-nexora-ink"><input type="checkbox" checked={form.is_featured} onChange={(e) => set("is_featured", e.target.checked)} data-testid="pf-featured" /> Feature this product on my storefront</label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => save("published")} disabled={saving} className="nx-btn-primary" data-testid="pf-publish"><Save size={16} /> {saving ? "Saving…" : "Save & publish"}</button>
        <button onClick={() => save("draft")} disabled={saving} className="nx-btn-ghost" data-testid="pf-draft">Save as draft</button>
      </div>

      <style>{`.inp{width:100%;border:1px solid #E7EEE9;border-radius:0.75rem;padding:0.6rem 0.9rem;font-size:0.875rem;outline:none}.inp:focus{border-color:#10B981}`}</style>
    </div>
  );
}

function Field({ label, children }) {
  return <div><label className="mb-1.5 block text-sm font-medium text-nexora-ink">{label}</label>{children}</div>;
}
