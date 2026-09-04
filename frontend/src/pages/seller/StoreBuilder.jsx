import React, { useEffect, useState } from "react";
import { Save, Eye, ExternalLink, Rocket, Plus, X } from "lucide-react";
import { api, formatApiError, resolveImage } from "@/lib/api";
import { Loader, Badge } from "@/components/shared/Bits";
import { useSeller } from "@/context/SellerContext";
import ImageUpload from "@/components/seller/ImageUpload";
import LockGate from "@/components/seller/LockGate";
import { getTheme } from "@/lib/themePresets";
import { toast } from "sonner";

export default function StoreBuilder() {
  const { shop, ent, reload } = useSeller();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (shop) setForm({ ...shop, social_links: shop.social_links || {}, contact: shop.contact || {}, policies: shop.policies || {}, collections: shop.collections || [] }); }, [shop]);
  if (!form) return <Loader />;

  const theme = getTheme(form.theme_preset);
  const accent = form.accent_color || theme.accent;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setNested = (obj, k, v) => setForm((f) => ({ ...f, [obj]: { ...f[obj], [k]: v } }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/seller/shop", form);
      await reload();
      toast.success("Storefront saved");
    } catch (e) { toast.error(formatApiError(e)); } finally { setSaving(false); }
  };
  const publishToggle = async () => {
    const pub = form.status === "published";
    await api.post(`/seller/shop/${pub ? "unpublish" : "publish"}`);
    await reload();
    set("status", pub ? "draft" : "published");
    toast.success(pub ? "Unpublished" : "Store published!");
  };

  const addCollection = () => set("collections", [...form.collections, { name: "New Collection", product_ids: [] }]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-nexora-ink">Store builder</h1>
          <p className="text-sm text-nexora-muted">Customize how your storefront looks to customers.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/shop/${form.slug}`} target="_blank" rel="noreferrer" className="nx-btn-ghost" data-testid="sb-view-store"><Eye size={15} /> View as customer <ExternalLink size={13} /></a>
          <button onClick={publishToggle} className="nx-btn-ghost" data-testid="sb-publish"><Rocket size={15} /> {form.status === "published" ? "Unpublish" : "Publish"}</button>
          <button onClick={save} disabled={saving} className="nx-btn-primary" data-testid="sb-save"><Save size={15} /> {saving ? "Saving…" : "Save"}</button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Editor */}
        <div className="space-y-5">
          <Section title="Shop identity">
            <ImageUpload label="Logo" value={form.logo} onChange={(v) => set("logo", v)} testid="sb-logo" />
            <ImageUpload label="Banner / Hero image" value={form.hero_image} onChange={(v) => set("hero_image", v)} testid="sb-hero" />
            <F label="Shop name"><input value={form.name} onChange={(e) => set("name", e.target.value)} className="inp" data-testid="sb-name" /></F>
            <F label="Description"><textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} className="inp" /></F>
          </Section>

          <Section title="Hero section">
            <F label="Hero heading"><input value={form.hero_heading} onChange={(e) => set("hero_heading", e.target.value)} className="inp" data-testid="sb-hero-heading" /></F>
            <F label="Hero subheading"><input value={form.hero_subheading} onChange={(e) => set("hero_subheading", e.target.value)} className="inp" /></F>
            <F label="CTA button text"><input value={form.hero_cta} onChange={(e) => set("hero_cta", e.target.value)} className="inp" /></F>
          </Section>

          <Section title="Brand colors">
            {ent?.custom_accent_color ? (
              <div className="flex gap-4">
                <F label="Accent color"><input type="color" value={accent} onChange={(e) => set("accent_color", e.target.value)} className="h-11 w-20 rounded-lg border border-nexora-border" data-testid="sb-accent" /></F>
                <F label="Secondary"><input type="color" value={form.secondary_color || "#2DD4BF"} onChange={(e) => set("secondary_color", e.target.value)} className="h-11 w-20 rounded-lg border border-nexora-border" /></F>
              </div>
            ) : <LockGate feature="custom_accent_color" entitlements={ent} />}
          </Section>

          <Section title="Collections">
            {form.collections.map((c, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input value={c.name} onChange={(e) => { const nc = [...form.collections]; nc[i] = { ...c, name: e.target.value }; set("collections", nc); }} className="inp flex-1" />
                <button onClick={() => set("collections", form.collections.filter((_, idx) => idx !== i))} className="text-nexora-coral"><X size={18} /></button>
              </div>
            ))}
            <button onClick={addCollection} className="text-sm font-medium text-nexora-emerald" data-testid="sb-add-collection"><Plus size={14} className="inline" /> Add collection</button>
          </Section>

          <Section title="About & contact">
            <F label="About your shop"><textarea rows={3} value={form.about} onChange={(e) => set("about", e.target.value)} className="inp" /></F>
            <F label="Contact phone"><input value={form.contact?.phone || ""} onChange={(e) => setNested("contact", "phone", e.target.value)} className="inp" /></F>
            <F label="Facebook URL"><input value={form.social_links?.facebook || ""} onChange={(e) => setNested("social_links", "facebook", e.target.value)} className="inp" /></F>
            <F label="Instagram URL"><input value={form.social_links?.instagram || ""} onChange={(e) => setNested("social_links", "instagram", e.target.value)} className="inp" /></F>
          </Section>

          <Section title="Policies">
            <F label="Shipping policy"><textarea rows={2} value={form.policies?.shipping || ""} onChange={(e) => setNested("policies", "shipping", e.target.value)} className="inp" /></F>
            <F label="Returns policy"><textarea rows={2} value={form.policies?.returns || ""} onChange={(e) => setNested("policies", "returns", e.target.value)} className="inp" /></F>
          </Section>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-24 lg:h-fit">
          <p className="mb-2 text-sm font-semibold text-nexora-muted">Live preview</p>
          <div className="overflow-hidden rounded-2xl border border-nexora-border" style={{ backgroundColor: theme.bg }} data-testid="sb-preview">
            <div className="relative h-36 overflow-hidden bg-nexora-mintbg">
              {form.hero_image && <img src={resolveImage(form.hero_image)} alt="" className="h-full w-full object-cover" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </div>
            <div className="relative -mt-8 px-5 pb-6">
              <div className="flex items-center gap-3 rounded-2xl border border-nexora-border bg-white p-4">
                {form.logo ? <img src={resolveImage(form.logo)} className="h-14 w-14 rounded-xl object-cover" alt="" /> : <div className="grid h-14 w-14 place-items-center rounded-xl text-xl font-extrabold text-white" style={{ backgroundColor: accent }}>{form.name?.[0]}</div>}
                <div><div className="flex items-center gap-2"><h3 className={`text-lg font-extrabold text-nexora-ink ${theme.headingFont}`}>{form.name}</h3><Badge tone="ink">{theme.tag}</Badge></div><p className="text-xs text-nexora-muted line-clamp-1">{form.description}</p></div>
              </div>
              <div className="mt-4 rounded-2xl bg-white p-5 border border-nexora-border">
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: accent }}>{theme.tone}</p>
                <h4 className={`mt-1 text-xl font-extrabold text-nexora-ink ${theme.headingFont}`}>{form.hero_heading}</h4>
                <p className="mt-1 text-sm text-nexora-muted">{form.hero_subheading}</p>
                <span className="mt-3 inline-block rounded-full px-4 py-2 text-xs font-semibold text-white" style={{ backgroundColor: accent }}>{form.hero_cta}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`.inp{width:100%;border:1px solid #E7EEE9;border-radius:0.75rem;padding:0.6rem 0.9rem;font-size:0.875rem;outline:none}.inp:focus{border-color:#10B981}`}</style>
    </div>
  );
}

function Section({ title, children }) {
  return <div className="space-y-3 rounded-2xl border border-nexora-border bg-white p-5"><h3 className="font-bold text-nexora-ink">{title}</h3>{children}</div>;
}
function F({ label, children }) {
  return <div><label className="mb-1.5 block text-sm font-medium text-nexora-ink">{label}</label>{children}</div>;
}
