import React, { useEffect, useState } from "react";
import {
  Globe2,
  Search,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Monitor,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import LockGate from "@/components/seller/LockGate";
import { Loader } from "@/components/shared/Bits";
import { useSeller } from "@/context/SellerContext";
import { toast } from "sonner";

export default function StoreImport() {
  const { ent } = useSeller();
  const allowed = !!ent?.store_import;
  const [profile, setProfile] = useState(null);
  const [url, setUrl] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [manual, setManual] = useState(null);
  const [manualBusy, setManualBusy] = useState(false);

  const selectedCount = selected.size;
  const allSelected = scan?.products?.length > 0 && selectedCount === scan.products.length;

  const loadProfile = async () => {
    if (!allowed) return;
    const { data } = await api.get("/seller/import-store/profile");
    setProfile(data);
  };

  useEffect(() => {
    loadProfile();
  }, [allowed]);

  const applyScanResult = (data) => {
    setScan(data);
    setSelected(new Set((data.products || []).map((p) => p.source_key)));
  };

  const scanWebsite = async (e) => {
    e.preventDefault();
    if (!confirmed) {
      toast.error("Confirm that you own the website or have permission to import it.");
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
      applyScanResult(data);
      if (data.count > 0) {
        toast.success(`Found ${data.count} product(s)`);
      } else if (data.manual_required) {
        toast.info("Automatic scan needs your help. Use the assisted browser below.");
      } else {
        toast.info("No products were found automatically.");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not scan the website");
    } finally {
      setScanning(false);
    }
  };

  const startManualBrowser = async () => {
    if (!confirmed) {
      toast.error("Confirm website ownership/permission first.");
      return;
    }
    setManualBusy(true);
    try {
      const { data } = await api.post("/seller/import-store/manual/start", {
        url: scan?.website_url || url,
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

  const continueManualBrowser = async () => {
    if (!manual?.session_id) return;
    setManualBusy(true);
    try {
      const { data } = await api.post(
        `/seller/import-store/manual/${manual.session_id}/continue`
      );
      if (data.scan_id && data.count > 0) {
        applyScanResult(data);
        setManual(null);
        toast.success(`Found ${data.count} product(s) after browser verification`);
      } else {
        setManual((prev) => ({ ...prev, ...data }));
        toast.info(data.message || "More manual navigation is needed.");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not continue browser scan");
    } finally {
      setManualBusy(false);
    }
  };

  const cancelManualBrowser = async () => {
    const sessionId = manual?.session_id;
    setManual(null);
    if (!sessionId) return;
    try {
      await api.post(`/seller/import-store/manual/${sessionId}/cancel`);
    } catch {
      // Session may already be closed/expired; nothing else to do.
    }
  };

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (!scan?.products) return;
    setSelected(allSelected ? new Set() : new Set(scan.products.map((p) => p.source_key)));
  };

  const doImport = async () => {
    if (!scan || selected.size === 0) return;
    setImporting(true);
    try {
      const { data } = await api.post("/seller/import-store/import", {
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

  const saveSync = async (enabled) => {
    if (!profile?.website_url) return;
    try {
      await api.put("/seller/import-store/auto-sync", {
        enabled,
        sync_fields: profile.sync_fields || ["title", "description", "price", "discount_price", "images", "stock", "sku"],
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
          <h1 className="text-2xl font-extrabold text-nexora-ink">Import Existing Store</h1>
          <p className="text-sm text-nexora-muted">Bring products from an existing website into Nexora.</p>
        </div>
        <LockGate feature="store_import" entitlements={ent} />
      </div>
    );
  }

  if (profile === null) return <Loader label="Loading store importer" />;

  const challengeType = manual?.challenge_type || scan?.challenge_type;
  const challengeTitle =
    challengeType === "captcha"
      ? "This store needs CAPTCHA / human verification"
      : challengeType === "login"
        ? "This store needs you to log in"
        : challengeType === "browser_setup"
          ? "Rendered browser setup is required"
          : "Nexora needs a browser-assisted scan";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-nexora-border bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-nexora-mintbg text-nexora-emerald">
            <Globe2 size={21} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-nexora-ink">Import Existing Store</h1>
              <span className="rounded-full bg-[#FFF1CC] px-2.5 py-1 text-[11px] font-extrabold text-[#A96D00]">PRO</span>
            </div>
            <p className="mt-1 text-sm text-nexora-muted">
              Paste an ecommerce URL. Nexora scans public data first, then uses a rendered browser fallback for JavaScript stores.
            </p>
          </div>
        </div>

        <form onSubmit={scanWebsite} className="mt-6 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourstore.com"
              className="min-w-0 flex-1 rounded-xl border border-nexora-border px-4 py-3 text-sm outline-none focus:border-nexora-emerald"
            />
            <button disabled={scanning || !url.trim()} className="nx-btn-primary justify-center">
              <Search size={15} /> {scanning ? "Scanning store..." : "Scan Store"}
            </button>
          </div>
          <label className="flex items-start gap-2 text-xs text-nexora-muted">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            I own this website or I have permission to import and synchronize its product catalogue.
          </label>
        </form>

        <div className="mt-4 rounded-2xl bg-[#F8FAF9] p-4 text-xs leading-5 text-nexora-muted">
          Nexora checks Shopify, WooCommerce, sitemaps, JSON-LD, embedded app data, public product APIs and rendered product pages.
          If a store requires login or CAPTCHA, Nexora will ask you to complete that step yourself in a temporary browser window.
          Nexora does not ask for or store the store password in this import form.
        </div>
      </section>

      {scan && (
        <section className="rounded-2xl border border-nexora-border bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-nexora-muted">Scan result</p>
              <h2 className="text-xl font-extrabold text-nexora-ink">{scan.count} product(s) found</h2>
              <p className="text-xs text-nexora-muted">Detected source: {scan.platform}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={toggleAll} className="nx-btn-ghost" disabled={!scan.products?.length}>
                {allSelected ? "Clear all" : "Select all"}
              </button>
              <button disabled={importing || selectedCount === 0} onClick={doImport} className="nx-btn-primary">
                <Download size={15} /> {importing ? "Importing..." : `Import ${selectedCount}`}
              </button>
            </div>
          </div>

          {scan.scan_report?.length > 0 && (
            <div className="mt-4 rounded-2xl border border-nexora-border bg-[#FAFCFB] p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-nexora-muted">What Nexora checked</p>
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
            </div>
          )}

          {(scan.manual_required || (!scan.count && scan.browser_assist_available)) && (
            <div className="mt-4 rounded-2xl border border-[#F3D9A2] bg-[#FFFCF5] p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-nexora-amber">
                  <Monitor size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-extrabold text-nexora-ink">{challengeTitle}</h3>
                  <p className="mt-1 text-sm leading-6 text-nexora-muted">
                    {manual?.message || scan.manual_message ||
                      "Automatic extraction could not finish. Open the assisted browser, navigate until the products are visible, then continue the scan."}
                  </p>

                  {!manual ? (
                    <div className="mt-3">
                      <button
                        onClick={startManualBrowser}
                        disabled={manualBusy || scan.browser_assist_available === false}
                        className="nx-btn-primary"
                      >
                        <Monitor size={15} />
                        {manualBusy ? "Opening browser..." : "Open browser to continue"}
                      </button>
                      {scan.browser_assist_available === false && (
                        <p className="mt-2 text-xs text-nexora-coral">
                          Browser assistance is not available on this backend yet. Install the updated backend requirements first.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-nexora-border bg-white p-4">
                      <div className="flex items-start gap-2">
                        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-nexora-emerald" />
                        <div>
                          <p className="text-sm font-bold text-nexora-ink">Temporary browser is open</p>
                          <p className="mt-1 text-xs leading-5 text-nexora-muted">
                            Complete the login/CAPTCHA there if required. You can also manually open the shop or a product page.
                            When products are visible, return here and click Continue scan.
                          </p>
                          {manual.privacy_note && (
                            <p className="mt-2 text-xs font-medium text-nexora-emerald">{manual.privacy_note}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={continueManualBrowser} disabled={manualBusy} className="nx-btn-primary">
                          <Search size={15} />
                          {manualBusy ? "Reading products..." : "Continue scan"}
                        </button>
                        <button onClick={cancelManualBrowser} disabled={manualBusy} className="nx-btn-ghost">
                          <XCircle size={15} /> Cancel browser
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {scan.warnings?.map((warning) => (
            <div key={warning} className="mt-3 flex items-start gap-2 rounded-xl bg-[#FFFCF5] p-3 text-xs text-nexora-amber">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {warning}
            </div>
          ))}

          <div className="mt-4 max-h-[520px] divide-y divide-nexora-border overflow-y-auto rounded-xl border border-nexora-border">
            {(scan.products || []).map((p) => (
              <label key={p.source_key} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-[#FAFCFB]">
                <input
                  type="checkbox"
                  checked={selected.has(p.source_key)}
                  onChange={() => toggle(p.source_key)}
                />
                <div className="h-14 w-14 overflow-hidden rounded-xl bg-[#F4F6F5]">
                  {p.images?.[0] ? <img src={p.images[0]} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-nexora-ink">{p.title}</p>
                  <p className="text-xs text-nexora-muted">
                    ৳{Number(p.discount_price ?? p.price).toLocaleString()}{p.category ? ` · ${p.category}` : ""}
                  </p>
                </div>
                <div className="hidden text-right text-xs sm:block">
                  {p.stock_known ? (
                    <span className="text-nexora-emerald">Stock: {p.stock}</span>
                  ) : (
                    <span className="text-nexora-amber">Stock unknown</span>
                  )}
                </div>
              </label>
            ))}
            {!scan.products?.length && (
              <div className="p-6 text-center text-sm text-nexora-muted">
                No products are ready for import yet. Use browser assistance above if Nexora asks for it.
              </div>
            )}
          </div>
        </section>
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
                Every {profile.interval_hours || 6} hours · price, stock, title, description and images can stay synchronized when the source remains publicly accessible.
              </p>
              {profile.last_sync_at && (
                <p className="mt-1 text-xs text-nexora-muted">Last sync: {new Date(profile.last_sync_at).toLocaleString()}</p>
              )}
              {profile.last_sync_error && (
                <p className="mt-1 text-xs text-nexora-coral">Last sync error: {profile.last_sync_error}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={syncNow} disabled={syncing} className="nx-btn-ghost">
                <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
                {syncing ? "Syncing..." : "Sync now"}
              </button>
              <button
                onClick={() => saveSync(!profile.auto_sync)}
                className={profile.auto_sync ? "nx-btn-ghost" : "nx-btn-primary"}
              >
                <CheckCircle2 size={15} />
                {profile.auto_sync ? "Auto sync ON" : "Enable auto sync"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
