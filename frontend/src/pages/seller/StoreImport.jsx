import React, { useEffect, useMemo, useState } from "react";
import {
  Globe2,
  Search,
  Download,
  RefreshCw,
  CheckCircle2,
  Zap,
  Bot,
  Send,
  ExternalLink,
  CopyCheck,
  CircleX,
  MessageCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import LockGate from "@/components/seller/LockGate";
import { Loader } from "@/components/shared/Bits";
import { useSeller } from "@/context/SellerContext";
import { toast } from "sonner";

const splitList = (value) =>
  String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const isFacebookUrl = (value) => {
  try {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withScheme).hostname.toLowerCase().includes("facebook.com");
  } catch {
    return false;
  }
};

export default function StoreImport() {
  const { ent } = useSeller();
  const allowed = !!ent?.store_import;
  const [profile, setProfile] = useState(null);
  const [categories, setCategories] = useState([]);
  const [url, setUrl] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [manual, setManual] = useState(null);
  const [manualBusy, setManualBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [draftDetails, setDraftDetails] = useState({});

  const selectedCount = selected.size;
  const readyProducts = useMemo(
    () => (scan?.products || []).filter((p) => p.ready && !p.ignored && !p.duplicate),
    [scan]
  );
  const allSelected = readyProducts.length > 0 && selectedCount === readyProducts.length;

  const loadProfile = async () => {
    if (!allowed) return;
    const { data } = await api.get("/seller/import-store/profile");
    setProfile(data);
  };

  const loadCategories = async () => {
    const { data } = await api.get("/categories");
    setCategories(data || []);
  };

  useEffect(() => {
    loadProfile();
    loadCategories().catch(() => {});
  }, [allowed]);

  const selectReady = (products) => {
    setSelected(
      new Set(
        (products || [])
          .filter((p) => p.ready && !p.ignored && !p.duplicate)
          .map((p) => p.source_key)
      )
    );
  };

  const prepareScan = async (raw) => {
    const { data } = await api.post(`/seller/import-store/ai/prepare/${raw.scan_id}`);
    const merged = { ...raw, ...data };
    setScan(merged);
    selectReady(merged.products);
    setDraftDetails(
      Object.fromEntries(
        (merged.products || []).map((p) => [
          p.source_key,
          { sizes: (p.sizes || []).join(", "), colors: (p.colors || []).join(", ") },
        ])
      )
    );
    return merged;
  };

  const scanWebsite = async (e) => {
    e.preventDefault();
    if (!confirmed) {
      toast.error("Confirm that you own the website/page or have permission to import it.");
      return;
    }
    setScanning(true);
    setScan(null);
    setManual(null);
    try {
      const { data } = await api.post("/seller/import-store/scan", {
        url,
        confirm_rights: true,
      });
      if (data.count > 0) {
        const prepared = await prepareScan(data);
        toast.success(`${prepared.ai_summary?.ready || 0} product(s) ready to review`);
      } else {
        setScan(data);
        setSelected(new Set());
        toast.message("Automatic scan needs help. Use the assisted browser below.");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not scan this source");
    } finally {
      setScanning(false);
    }
  };

  const openAssistedBrowser = async () => {
    if (!confirmed || !url.trim()) return;
    setManualBusy(true);
    try {
      const { data } = await api.post("/seller/import-store/manual/start", {
        url,
        confirm_rights: true,
      });
      setManual(data);
      toast.success("Assisted browser opened. Complete any login/CAPTCHA there.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not open assisted browser");
    } finally {
      setManualBusy(false);
    }
  };

  const continueAssistedScan = async () => {
    if (!manual?.session_id) return;
    setManualBusy(true);
    try {
      const endpoint = isFacebookUrl(url)
        ? `/seller/import-store/social/manual/${manual.session_id}/continue`
        : `/seller/import-store/manual/${manual.session_id}/continue`;
      const { data } = await api.post(endpoint);
      if (data.status === "waiting_for_user" || data.manual_required) {
        setManual({ ...manual, ...data });
        toast.message(data.message || "More manual navigation is required.");
      } else if (data.count > 0) {
        const prepared = await prepareScan(data);
        setManual(null);
        toast.success(`${prepared.ai_summary?.ready || 0} product(s) ready after assisted scan`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Assisted scan could not continue");
    } finally {
      setManualBusy(false);
    }
  };

  const cancelAssisted = async () => {
    if (!manual?.session_id) return setManual(null);
    try {
      await api.post(`/seller/import-store/manual/${manual.session_id}/cancel`);
    } catch {
      // Session may already be closed/expired.
    }
    setManual(null);
  };

  const toggle = (key) => {
    const product = scan?.products?.find((p) => p.source_key === key);
    if (!product?.ready || product?.ignored || product?.duplicate) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(readyProducts.map((p) => p.source_key)));
  };

  const patchProduct = async (product, patch) => {
    try {
      const { data } = await api.patch(
        `/seller/import-store/ai/prepare/${scan.scan_id}/product/${product.source_key}`,
        patch
      );
      const next = { ...scan, products: data.products, ai_summary: data.ai_summary };
      setScan(next);
      const updated = data.products.find((p) => p.source_key === product.source_key);
      setSelected((prev) => {
        const nextSelected = new Set(prev);
        if (updated?.ready && !updated?.ignored && !updated?.duplicate) nextSelected.add(product.source_key);
        else nextSelected.delete(product.source_key);
        return nextSelected;
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not update product details");
    }
  };

  const saveDetails = async (product) => {
    const draft = draftDetails[product.source_key] || {};
    await patchProduct(product, {
      sizes: splitList(draft.sizes),
      colors: splitList(draft.colors),
    });
    toast.success("Required details updated");
  };

  const doImport = async () => {
    if (!scan || selected.size === 0) return;
    setImporting(true);
    try {
      const { data } = await api.post("/seller/import-store/ai/import", {
        scan_id: scan.scan_id,
        product_keys: Array.from(selected),
        publish: false,
      });
      toast.success(data.message);
      await loadProfile();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const sendChat = async (e) => {
    e?.preventDefault();
    const message = chatInput.trim();
    if (!message || !scan?.scan_id || !scan?.ai_prepared) return;
    setChatBusy(true);
    setChatInput("");
    try {
      const { data } = await api.post("/seller/import-store/ai/chat", {
        scan_id: scan.scan_id,
        message,
      });
      const next = {
        ...scan,
        products: data.products,
        ai_summary: data.ai_summary,
        assistant_chat: data.assistant_chat,
      };
      setScan(next);
      selectReady(data.products);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import assistant could not respond");
    } finally {
      setChatBusy(false);
    }
  };

  const saveSync = async (enabled) => {
    if (!profile?.website_url) return;
    try {
      await api.put("/seller/import-store/auto-sync", {
        enabled,
        sync_fields:
          profile.sync_fields || ["title", "description", "price", "discount_price", "images", "stock", "sku"],
        sync_new_products: profile.sync_new_products !== false,
        interval_hours: profile.interval_hours || 6,
      });
      await loadProfile();
      toast.success(enabled ? "Automatic sync enabled" : "Automatic sync disabled");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not update sync settings");
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/seller/import-store/sync-now");
      toast.success(`Sync complete: ${data.updated || 0} updated, ${data.created || 0} new`);
      await loadProfile();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (!allowed) {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-nexora-amber">PRO</p>
          <h1 className="text-2xl font-extrabold text-nexora-ink">AI Catalogue Import</h1>
          <p className="text-sm text-nexora-muted">Bring an existing website or supported social catalogue into Nexora.</p>
        </div>
        <LockGate feature="store_import" entitlements={ent} />
      </div>
    );
  }

  if (profile === null) return <Loader label="Loading store importer" />;

  const summary = scan?.ai_summary;
  const chatHistory = scan?.assistant_chat || [];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-nexora-border bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-nexora-mintbg text-nexora-emerald">
            <Globe2 size={21} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold text-nexora-ink">AI Catalogue Import</h1>
              <span className="rounded-full bg-[#FFF1CC] px-2.5 py-1 text-[11px] font-extrabold text-[#A96D00]">PRO</span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-nexora-muted">
              Paste an ecommerce website or Facebook Page link. Nexora scans, removes duplicates, maps marketplace categories, checks required details and prepares only import-ready products.
            </p>
          </div>
        </div>

        <form onSubmit={scanWebsite} className="mt-6 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourstore.com or https://facebook.com/yourpage"
              className="min-w-0 flex-1 rounded-xl border border-nexora-border px-4 py-3 text-sm outline-none focus:border-nexora-emerald"
            />
            <button disabled={scanning || !url.trim()} className="nx-btn-primary justify-center">
              <Search size={15} /> {scanning ? "Scanning & organizing..." : "Scan Catalogue"}
            </button>
          </div>
          <label className="flex items-start gap-2 text-xs text-nexora-muted">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
            I own this website/page or I have permission to import and synchronize its product catalogue.
          </label>
        </form>

        <div className="mt-4 rounded-2xl bg-[#F8FAF9] p-4 text-xs leading-5 text-nexora-muted">
          Nexora tries public APIs, sitemaps, structured data and rendered product pages first. If login, CAPTCHA or Facebook verification is required, the assisted browser asks you to complete it manually. Nexora does not bypass security controls or collect your login password.
        </div>
      </section>

      {(scan?.manual_required || (scan && scan.count === 0) || manual) && (
        <section className="rounded-2xl border border-nexora-amber/30 bg-[#FFFCF5] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-nexora-amber">Your attention is needed</p>
              <h2 className="mt-1 text-lg font-extrabold text-nexora-ink">
                {manual?.challenge_type === "captcha" || scan?.challenge_type === "captcha"
                  ? "Complete CAPTCHA / human verification"
                  : manual?.challenge_type === "login" || scan?.challenge_type === "login"
                    ? "Sign in to the source website"
                    : "Open the catalogue in the assisted browser"}
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-nexora-muted">
                {manual?.message || scan?.manual_message || "Open the assisted browser, make the product catalogue visible, then continue the scan."}
              </p>
              {isFacebookUrl(url) && (
                <p className="mt-2 text-xs font-semibold text-nexora-ink">
                  Facebook mode: log in yourself if asked, open the Page posts/photos/shop area, and let visible product posts load.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!manual?.session_id ? (
                <button onClick={openAssistedBrowser} disabled={manualBusy} className="nx-btn-primary">
                  <ExternalLink size={15} /> {manualBusy ? "Opening..." : "Open browser to continue"}
                </button>
              ) : (
                <>
                  <button onClick={continueAssistedScan} disabled={manualBusy} className="nx-btn-primary">
                    <RefreshCw size={15} className={manualBusy ? "animate-spin" : ""} />
                    {manualBusy ? "Reading visible products..." : "I've finished — Continue scan"}
                  </button>
                  <button onClick={cancelAssisted} className="nx-btn-ghost">Cancel</button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {scan?.ai_prepared && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 rounded-2xl border border-nexora-border bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-nexora-muted">AI review</p>
                <h2 className="text-xl font-extrabold text-nexora-ink">{scan.count} product candidate(s)</h2>
                <p className="text-xs text-nexora-muted">Detected source: {scan.platform}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={toggleAll} className="nx-btn-ghost" disabled={!readyProducts.length}>
                  {allSelected ? "Clear ready" : "Select all ready"}
                </button>
                <button disabled={importing || selectedCount === 0} onClick={doImport} className="nx-btn-primary">
                  <Download size={15} /> {importing ? "Importing..." : `Import ${selectedCount}`}
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="Ready" value={summary?.ready || 0} tone="text-nexora-emerald" />
              <Stat label="Incomplete" value={summary?.incomplete || 0} tone="text-nexora-amber" />
              <Stat label="Duplicates" value={summary?.duplicates || 0} tone="text-nexora-coral" />
              <Stat label="Ignored" value={summary?.ignored || 0} tone="text-nexora-muted" />
            </div>

            {scan.social_stats && (
              <div className="mt-4 rounded-xl bg-nexora-mintbg p-3 text-xs text-nexora-ink">
                Facebook analysis: reviewed <b>{scan.social_stats.posts_reviewed || 0}</b> visible posts · kept <b>{scan.social_stats.product_candidates || 0}</b> price-bearing product candidates · ignored <b>{scan.social_stats.ignored_without_visible_price_or_image || 0}</b> posts without enough product information.
              </div>
            )}

            {scan.scan_report?.length > 0 && (
              <details className="mt-4 rounded-2xl border border-nexora-border bg-[#FAFCFB] p-4">
                <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-[0.14em] text-nexora-muted">What Nexora checked</summary>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {scan.scan_report.map((step, index) => (
                    <div key={`${step.stage}-${index}`} className="flex items-start gap-2 rounded-xl bg-white p-3 text-xs">
                      <CheckCircle2 size={15} className={step.status === "ok" ? "mt-0.5 shrink-0 text-nexora-emerald" : "mt-0.5 shrink-0 text-nexora-muted"} />
                      <div>
                        <p className="font-bold text-nexora-ink">{step.stage}</p>
                        <p className="mt-0.5 leading-5 text-nexora-muted">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="mt-4 divide-y divide-nexora-border overflow-hidden rounded-xl border border-nexora-border">
              {scan.products.map((p) => {
                const draft = draftDetails[p.source_key] || { sizes: (p.sizes || []).join(", "), colors: (p.colors || []).join(", ") };
                const needsVariants = p.category === "fashion" || p.missing_fields?.includes("size") || p.missing_fields?.includes("color");
                return (
                  <div key={p.source_key} className={`p-4 ${p.ignored ? "bg-[#FAFAFA] opacity-75" : "bg-white"}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-5"
                        checked={selected.has(p.source_key)}
                        disabled={!p.ready || p.ignored || p.duplicate}
                        onChange={() => toggle(p.source_key)}
                      />
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#F4F6F5]">
                        {p.images?.[0] ? <img src={p.images[0]} alt="" className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 truncate text-sm font-bold text-nexora-ink">{p.title}</p>
                          {p.duplicate ? (
                            <Pill icon={CopyCheck} text="Duplicate · auto ignored" tone="bg-[#FFEDE5] text-nexora-coral" />
                          ) : p.ready ? (
                            <Pill icon={CheckCircle2} text="Ready" tone="bg-nexora-mintbg text-nexora-emerald" />
                          ) : (
                            <span className="rounded-full bg-[#FFF8E8] px-2 py-1 text-[10px] font-extrabold text-nexora-amber">Needs details</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-nexora-muted">
                          ৳{Number(p.discount_price ?? p.price).toLocaleString()} · {p.platform}
                          {p.category_confidence != null ? ` · category confidence ${Math.round(p.category_confidence * 100)}%` : ""}
                        </p>
                        {p.duplicate_reason && <p className="mt-1 text-xs text-nexora-coral">{p.duplicate_reason}</p>}
                        {!!p.missing_fields?.length && (
                          <p className="mt-1 text-xs font-semibold text-nexora-amber">Required: {p.missing_fields.join(", ")}</p>
                        )}

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <label className="text-xs text-nexora-muted">
                            Nexora category
                            <select
                              value={p.category || ""}
                              onChange={(e) => patchProduct(p, { category: e.target.value })}
                              className="mt-1 h-10 w-full rounded-lg border border-nexora-border bg-white px-3 text-sm text-nexora-ink outline-none focus:border-nexora-emerald"
                            >
                              <option value="">Choose category</option>
                              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                            </select>
                          </label>
                          <div className="flex items-end gap-2">
                            <button
                              onClick={() => patchProduct(p, { ignored: !p.ignored })}
                              disabled={p.duplicate}
                              className="nx-btn-ghost h-10 flex-1 justify-center"
                            >
                              {p.ignored ? <CheckCircle2 size={14} /> : <CircleX size={14} />}
                              {p.ignored ? "Include" : "Ignore"}
                            </button>
                          </div>
                        </div>

                        {needsVariants && (
                          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                            <input
                              value={draft.sizes ?? ""}
                              onChange={(e) => setDraftDetails((prev) => ({ ...prev, [p.source_key]: { ...draft, sizes: e.target.value } }))}
                              placeholder="Sizes: S, M, L, XL"
                              className="h-10 rounded-lg border border-nexora-border px-3 text-xs outline-none focus:border-nexora-emerald"
                            />
                            <input
                              value={draft.colors ?? ""}
                              onChange={(e) => setDraftDetails((prev) => ({ ...prev, [p.source_key]: { ...draft, colors: e.target.value } }))}
                              placeholder="Colors: Black, White"
                              className="h-10 rounded-lg border border-nexora-border px-3 text-xs outline-none focus:border-nexora-emerald"
                            />
                            <button onClick={() => saveDetails(p)} className="nx-btn-ghost h-10 justify-center">Save details</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-nexora-border bg-white p-4 xl:sticky xl:top-20">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#F2EDFF] text-[#6A4FD6]"><Bot size={18} /></div>
              <div>
                <p className="font-extrabold text-nexora-ink">Nexora Import AI</p>
                <p className="text-[11px] text-nexora-muted">Continuous catalogue assistant</p>
              </div>
            </div>

            <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto rounded-xl bg-[#FAFCFB] p-3">
              {!chatHistory.length && (
                <div className="rounded-xl bg-white p-3 text-xs leading-5 text-nexora-muted">
                  I organized the scan, mapped categories and auto-ignored duplicates. Try “ignore out of stock”, “only fashion”, “ignore red shirt”, “select all ready”, or “put all panjabi under fashion”.
                </div>
              )}
              {chatHistory.map((m) => (
                <div key={m.id} className={`rounded-xl p-3 text-xs leading-5 ${m.role === "user" ? "ml-6 bg-[#6A4FD6] text-white" : "mr-4 bg-white text-nexora-ink"}`}>
                  {m.message}
                </div>
              ))}
            </div>

            <form onSubmit={sendChat} className="mt-3 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Tell AI what to keep/change..."
                className="min-w-0 flex-1 rounded-xl border border-nexora-border px-3 text-xs outline-none focus:border-nexora-emerald"
              />
              <button disabled={chatBusy || !chatInput.trim()} className="grid h-10 w-10 place-items-center rounded-xl bg-[#6A4FD6] text-white disabled:opacity-50">
                {chatBusy ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </form>
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-nexora-muted">
              <MessageCircle size={12} className="mt-0.5 shrink-0" /> AI helps organize the catalogue; deterministic validation still blocks duplicates and missing required details before import.
            </p>
          </aside>
        </div>
      )}

      {profile.website_url && (
        <section className="rounded-2xl border border-nexora-border bg-white p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Zap className="text-nexora-amber" size={19} />
                <h2 className="font-extrabold text-nexora-ink">Automatic product sync</h2>
              </div>
              <p className="mt-1 text-sm text-nexora-muted">{profile.website_url}</p>
              <p className="mt-1 text-xs text-nexora-muted">
                Every {profile.interval_hours || 6} hours · price, stock, title, description and images can stay synchronized where the source exposes them.
              </p>
              {profile.last_sync_at && <p className="mt-1 text-xs text-nexora-muted">Last sync: {new Date(profile.last_sync_at).toLocaleString()}</p>}
              {profile.last_sync_error && <p className="mt-1 text-xs text-nexora-coral">Last sync error: {profile.last_sync_error}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={syncNow} disabled={syncing} className="nx-btn-ghost">
                <RefreshCw size={15} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing..." : "Sync now"}
              </button>
              <button onClick={() => saveSync(!profile.auto_sync)} className={profile.auto_sync ? "nx-btn-ghost" : "nx-btn-primary"}>
                <CheckCircle2 size={15} /> {profile.auto_sync ? "Auto sync ON" : "Enable auto sync"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-nexora-border bg-[#FAFCFB] p-3">
      <p className={`text-xl font-extrabold ${tone}`}>{value}</p>
      <p className="text-[11px] font-semibold text-nexora-muted">{label}</p>
    </div>
  );
}

function Pill({ icon: Icon, text, tone }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold ${tone}`}>
      <Icon size={11} /> {text}
    </span>
  );
}
