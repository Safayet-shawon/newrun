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
  AlertTriangle,
  Wrench,
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

const withScheme = (value) =>
  /^https?:\/\//i.test(String(value || "").trim())
    ? String(value || "").trim()
    : `https://${String(value || "").trim()}`;

const isFacebookUrl = (value) => {
  try {
    const host = new URL(withScheme(value)).hostname.toLowerCase();
    return host === "facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
};

const firstMissing = (product, field) =>
  (product?.missing_fields || []).includes(field);

export default function StoreImportV2() {
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
  const [publishAfterImport, setPublishAfterImport] = useState(true);
  const [manual, setManual] = useState(null);
  const [manualBusy, setManualBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [draftDetails, setDraftDetails] = useState({});
  const [syncing, setSyncing] = useState(false);

  const readyProducts = useMemo(
    () =>
      (scan?.products || []).filter(
        (p) => p.ready && !p.ignored && !p.duplicate
      ),
    [scan]
  );

  const selectedCount = selected.size;
  const allSelected =
    readyProducts.length > 0 &&
    readyProducts.every((p) => selected.has(p.source_key));

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
    if (!allowed) return;
    loadProfile().catch(() => {});
    loadCategories().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const setDrafts = (products) => {
    setDraftDetails(
      Object.fromEntries(
        (products || []).map((p) => [
          p.source_key,
          {
            sizes: (p.sizes || []).join(", "),
            colors: (p.colors || []).join(", "),
            price: p.price ?? "",
            image_url: p.images?.[0] || "",
          },
        ])
      )
    );
  };

  const prepareScan = async (raw) => {
    const { data } = await api.post(
      `/seller/import-store/ai/prepare/${raw.scan_id}`
    );
    const merged = { ...raw, ...data };
    setScan(merged);
    setCategories(data.categories || categories);
    selectReady(merged.products);
    setDrafts(merged.products);
    return merged;
  };

  const startManual = async (sourceUrl) => {
    const endpoint = isFacebookUrl(sourceUrl)
      ? "/seller/import-store/social/manual/start"
      : "/seller/import-store/manual/start";

    const { data } = await api.post(endpoint, {
      url: sourceUrl,
      confirm_rights: true,
    });
    setManual(data);
    return data;
  };

  const scanCatalogue = async (e) => {
    e.preventDefault();
    if (!confirmed) {
      toast.error(
        "Confirm that you own this website/page or have permission to import it."
      );
      return;
    }
    if (!url.trim()) return;

    setScanning(true);
    setScan(null);
    setManual(null);
    setSelected(new Set());
    try {
      if (isFacebookUrl(url)) {
        const manualData = await startManual(url);
        setScan({
          website_url: withScheme(url),
          platform: "facebook-page",
          count: 0,
          products: [],
          manual_required: true,
          challenge_type: manualData.challenge_type || "facebook_navigation",
          manual_message: manualData.message,
          browser_assist_available: true,
          scan_report: [
            {
              stage: "Facebook Page",
              status: "checked",
              detail:
                "Facebook import uses the assisted browser so you can complete login/verification yourself.",
            },
          ],
        });
        toast.message(
          "Facebook opened in the assisted browser. Make the Page products/posts visible, then continue the scan."
        );
        return;
      }

      const { data } = await api.post("/seller/import-store/scan", {
        url,
        confirm_rights: true,
      });

      if (data.count > 0) {
        const prepared = await prepareScan(data);
        toast.success(
          `${prepared.ai_summary?.ready || 0} product(s) ready to review`
        );
      } else {
        setScan(data);
        setSelected(new Set());
        if (data.challenge_type === "browser_setup") {
          toast.error(
            "Browser scanner needs one-time Playwright/Chromium setup on this PC."
          );
        } else {
          toast.message(
            "Automatic scan needs help. Use the assisted browser below."
          );
        }
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
      await startManual(url);
      toast.success(
        "Assisted browser opened. Complete any login/CAPTCHA and make the catalogue visible."
      );
    } catch (err) {
      toast.error(
        err.response?.data?.detail || "Could not open assisted browser"
      );
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
        setManual((prev) => ({ ...(prev || {}), ...data }));
        setScan((prev) => ({ ...(prev || {}), ...data }));
        toast.message(
          data.message || "More manual navigation is required."
        );
      } else if (data.count > 0) {
        const prepared = await prepareScan(data);
        setManual(null);
        toast.success(
          `${prepared.ai_summary?.ready || 0} product(s) ready after assisted scan`
        );
      } else {
        toast.message("No products were visible yet. Navigate and try again.");
      }
    } catch (err) {
      toast.error(
        err.response?.data?.detail || "Assisted scan could not continue"
      );
    } finally {
      setManualBusy(false);
    }
  };

  const cancelAssisted = async () => {
    if (!manual?.session_id) {
      setManual(null);
      return;
    }
    try {
      await api.post(`/seller/import-store/manual/${manual.session_id}/cancel`);
    } catch {
      // Session may already be closed or expired.
    }
    setManual(null);
  };

  const patchProduct = async (product, patch) => {
    try {
      const { data } = await api.patch(
        `/seller/import-store/ai/prepare/${scan.scan_id}/product/${product.source_key}`,
        patch
      );
      const next = {
        ...scan,
        products: data.products,
        ai_summary: data.ai_summary,
      };
      setScan(next);
      const updated = data.products.find(
        (p) => p.source_key === product.source_key
      );
      setSelected((prev) => {
        const result = new Set(prev);
        if (
          updated?.ready &&
          !updated?.ignored &&
          !updated?.duplicate
        ) {
          result.add(product.source_key);
        } else {
          result.delete(product.source_key);
        }
        return result;
      });
    } catch (err) {
      toast.error(
        err.response?.data?.detail || "Could not update product details"
      );
    }
  };

  const saveDetails = async (product) => {
    const draft = draftDetails[product.source_key] || {};
    const patch = {
      sizes: splitList(draft.sizes),
      colors: splitList(draft.colors),
    };
    if (String(draft.price || "").trim()) {
      patch.price = Number(draft.price);
    }
    if (String(draft.image_url || "").trim()) {
      patch.image_url = String(draft.image_url).trim();
    }
    await patchProduct(product, patch);
    toast.success("Product details updated");
  };

  const toggle = (key) => {
    const product = scan?.products?.find((p) => p.source_key === key);
    if (!product?.ready || product.ignored || product.duplicate) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(readyProducts.map((p) => p.source_key)));
    }
  };

  const doImport = async () => {
    if (!scan?.scan_id || selected.size === 0) return;
    setImporting(true);
    try {
      const { data } = await api.post("/seller/import-store/ai/import", {
        scan_id: scan.scan_id,
        product_keys: Array.from(selected),
        publish: publishAfterImport,
      });
      toast.success(data.message);
      await loadProfile();
      if (data.products) {
        setScan((prev) => ({
          ...prev,
          products: data.products,
          ai_summary: data.ai_summary,
        }));
      }
      setSelected(new Set());
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

    const optimistic = {
      id: `local-${Date.now()}`,
      role: "user",
      message,
    };
    setScan((prev) => ({
      ...prev,
      assistant_chat: [...(prev?.assistant_chat || []), optimistic],
    }));
    setChatInput("");
    setChatBusy(true);

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
      setDrafts(data.products);
    } catch (err) {
      toast.error(
        err.response?.data?.detail || "Import assistant could not respond"
      );
      setScan((prev) => ({
        ...prev,
        assistant_chat: (prev?.assistant_chat || []).filter(
          (m) => m.id !== optimistic.id
        ),
      }));
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
          profile.sync_fields || [
            "title",
            "description",
            "price",
            "discount_price",
            "images",
            "stock",
            "sku",
          ],
        sync_new_products: profile.sync_new_products !== false,
        interval_hours: profile.interval_hours || 6,
      });
      await loadProfile();
      toast.success(
        enabled ? "Automatic sync enabled" : "Automatic sync disabled"
      );
    } catch (err) {
      toast.error(
        err.response?.data?.detail || "Could not update sync settings"
      );
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/seller/import-store/sync-now");
      toast.success(
        `Sync complete: ${data.updated || 0} updated, ${data.created || 0} new`
      );
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
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-nexora-amber">
            PRO
          </p>
          <h1 className="text-2xl font-extrabold text-nexora-ink">
            AI Catalogue Import
          </h1>
          <p className="text-sm text-nexora-muted">
            Bring an existing website or supported social catalogue into Nexora.
          </p>
        </div>
        <LockGate feature="store_import" entitlements={ent} />
      </div>
    );
  }

  if (profile === null) return <Loader label="Loading store importer" />;

  const summary = scan?.ai_summary || {};
  const chatHistory = scan?.assistant_chat || [];
  const browserSetupMissing = scan?.challenge_type === "browser_setup";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-nexora-border bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-nexora-mintbg text-nexora-emerald">
            <Globe2 size={21} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold text-nexora-ink">
                AI Catalogue Import
              </h1>
              <span className="rounded-full bg-[#FFF1CC] px-2.5 py-1 text-[11px] font-extrabold text-[#A96D00]">
                PRO
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-nexora-muted">
              Paste an ecommerce website or Facebook Page link. Nexora scans the
              catalogue, keeps exact products separate, removes only high-confidence
              duplicates, maps marketplace categories and blocks incomplete products
              until required details are ready.
            </p>
          </div>
        </div>

        <form onSubmit={scanCatalogue} className="mt-6 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setScan(null);
                setManual(null);
                setSelected(new Set());
              }}
              placeholder="https://yourstore.com or https://facebook.com/yourpage"
              className="min-w-0 flex-1 rounded-xl border border-nexora-border px-4 py-3 text-sm outline-none focus:border-nexora-emerald"
            />
            <button
              disabled={scanning || !url.trim()}
              className="nx-btn-primary justify-center"
            >
              <Search size={15} />
              {scanning ? "Scanning & organizing..." : "Scan Catalogue"}
            </button>
          </div>
          <label className="flex items-start gap-2 text-xs text-nexora-muted">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            I own this website/page or I have permission to import its product
            catalogue.
          </label>
        </form>

        <div className="mt-4 rounded-2xl bg-[#F8FAF9] p-4 text-xs leading-5 text-nexora-muted">
          Website imports use public APIs, sitemaps, rendered pages and product
          links. Facebook imports use the assisted browser. Login/CAPTCHA is
          completed by you in that browser; Nexora does not bypass security or
          collect your password.
        </div>
      </section>

      {browserSetupMissing && (
        <section className="rounded-2xl border border-nexora-amber/40 bg-[#FFFCF5] p-5">
          <div className="flex gap-3">
            <Wrench className="mt-0.5 shrink-0 text-nexora-amber" size={20} />
            <div>
              <h2 className="font-extrabold text-nexora-ink">
                One-time browser scanner setup is required
              </h2>
              <p className="mt-1 text-sm text-nexora-muted">
                The code is installed in Nexora, but this PC still needs the Playwright
                package/browser engine. Run these once in the backend folder, restart
                the backend, then scan again.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-white p-3 text-xs text-nexora-ink">
{`py -m pip install -r requirements.txt
py -m playwright install chromium`}
              </pre>
            </div>
          </div>
        </section>
      )}

      {(scan?.manual_required || manual) && !browserSetupMissing && (
        <section className="rounded-2xl border border-nexora-amber/30 bg-[#FFFCF5] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-nexora-amber">
                Your attention is needed
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-nexora-ink">
                {manual?.challenge_type === "captcha" ||
                scan?.challenge_type === "captcha"
                  ? "Complete CAPTCHA / human verification"
                  : manual?.challenge_type === "login" ||
                    scan?.challenge_type === "login"
                    ? "Sign in to the source website"
                    : isFacebookUrl(url)
                      ? "Make the Facebook Page products visible"
                      : "Open the catalogue in the assisted browser"}
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-nexora-muted">
                {manual?.message ||
                  scan?.manual_message ||
                  "Open the assisted browser, make products visible, then continue the scan."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!manual?.session_id ? (
                <button
                  onClick={openAssistedBrowser}
                  disabled={manualBusy}
                  className="nx-btn-primary"
                >
                  <ExternalLink size={15} />
                  {manualBusy ? "Opening..." : "Open browser to continue"}
                </button>
              ) : (
                <>
                  <button
                    onClick={continueAssistedScan}
                    disabled={manualBusy}
                    className="nx-btn-primary"
                  >
                    <RefreshCw
                      size={15}
                      className={manualBusy ? "animate-spin" : ""}
                    />
                    {manualBusy
                      ? "Reading visible products..."
                      : "I've finished — Continue scan"}
                  </button>
                  <button onClick={cancelAssisted} className="nx-btn-ghost">
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {scan?.ai_prepared && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
          <section className="min-w-0 rounded-2xl border border-nexora-border bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-nexora-muted">
                  AI review
                </p>
                <h2 className="text-xl font-extrabold text-nexora-ink">
                  {scan.count} product candidate(s)
                </h2>
                <p className="text-xs text-nexora-muted">
                  Detected source: {scan.platform}
                </p>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <label className="flex cursor-pointer items-center justify-end gap-2 text-xs font-semibold text-nexora-muted">
                  <input type="checkbox" checked={publishAfterImport} onChange={(e) => setPublishAfterImport(e.target.checked)} />
                  Publish products immediately
                </label>
                <div className="flex flex-wrap gap-2">
                <button
                  onClick={toggleAll}
                  className="nx-btn-ghost"
                  disabled={!readyProducts.length}
                >
                  {allSelected ? "Clear ready" : "Select all ready"}
                </button>
                <button
                  disabled={importing || selectedCount === 0}
                  onClick={doImport}
                  className="nx-btn-primary"
                >
                  <Download size={15} />
                  {importing ? "Adding products..." : `Add ${selectedCount} to my shop`}
                </button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
              <Stat label="Ready" value={summary.ready || 0} tone="text-nexora-emerald" />
              <Stat label="Incomplete" value={summary.incomplete || 0} tone="text-nexora-amber" />
              <Stat label="Exact duplicates" value={summary.duplicates || 0} tone="text-nexora-coral" />
              <Stat label="Possible duplicates" value={summary.possible_duplicates || 0} tone="text-[#6A4FD6]" />
              <Stat label="Ignored" value={summary.ignored || 0} tone="text-nexora-muted" />
            </div>

            {scan.social_stats && (
              <div className="mt-4 rounded-xl bg-nexora-mintbg p-3 text-xs text-nexora-ink">
                Facebook analysis: reviewed{" "}
                <b>{scan.social_stats.posts_reviewed || 0}</b> visible posts ·
                kept <b>{scan.social_stats.product_candidates || 0}</b>{" "}
                price-bearing product candidates · excluded{" "}
                <b>
                  {scan.social_stats.ignored_without_visible_price_or_image || 0}
                </b>{" "}
                non-importable posts.
              </div>
            )}

            {scan.scan_report?.length > 0 && (
              <details className="mt-4 rounded-2xl border border-nexora-border bg-[#FAFCFB] p-4">
                <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-[0.14em] text-nexora-muted">
                  What Nexora checked
                </summary>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {scan.scan_report.map((step, index) => (
                    <div
                      key={`${step.stage}-${index}`}
                      className="flex items-start gap-2 rounded-xl bg-white p-3 text-xs"
                    >
                      <CheckCircle2
                        size={15}
                        className={
                          step.status === "ok"
                            ? "mt-0.5 shrink-0 text-nexora-emerald"
                            : "mt-0.5 shrink-0 text-nexora-muted"
                        }
                      />
                      <div>
                        <p className="font-bold text-nexora-ink">{step.stage}</p>
                        <p className="mt-0.5 leading-5 text-nexora-muted">
                          {step.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="mt-4 divide-y divide-nexora-border overflow-hidden rounded-xl border border-nexora-border">
              {scan.products.map((p) => {
                const draft = draftDetails[p.source_key] || {
                  sizes: (p.sizes || []).join(", "),
                  colors: (p.colors || []).join(", "),
                  price: p.price ?? "",
                  image_url: p.images?.[0] || "",
                };
                const needsVariants =
                  p.category === "fashion" ||
                  firstMissing(p, "size") ||
                  firstMissing(p, "color");
                const needsCoreEdit =
                  firstMissing(p, "price") || firstMissing(p, "image");

                return (
                  <div
                    key={p.source_key}
                    className={`p-4 ${
                      p.ignored ? "bg-[#FAFAFA] opacity-75" : "bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-5"
                        checked={selected.has(p.source_key)}
                        disabled={!p.ready || p.ignored || p.duplicate}
                        onChange={() => toggle(p.source_key)}
                      />
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#F4F6F5]">
                        {p.images?.[0] ? (
                          <img
                            src={p.images[0]}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 truncate text-sm font-bold text-nexora-ink">
                            {p.title}
                          </p>
                          {p.duplicate ? (
                            <Pill
                              icon={CopyCheck}
                              text="Exact duplicate · auto ignored"
                              tone="bg-[#FFEDE5] text-nexora-coral"
                            />
                          ) : p.ready ? (
                            <Pill
                              icon={CheckCircle2}
                              text="Ready"
                              tone="bg-nexora-mintbg text-nexora-emerald"
                            />
                          ) : (
                            <Pill
                              icon={AlertTriangle}
                              text="Needs details"
                              tone="bg-[#FFF8E8] text-nexora-amber"
                            />
                          )}
                          {p.possible_duplicate && !p.duplicate && (
                            <Pill
                              icon={CopyCheck}
                              text="Similar listing · review"
                              tone="bg-[#F2EDFF] text-[#6A4FD6]"
                            />
                          )}
                        </div>

                        <p className="mt-1 text-xs text-nexora-muted">
                          ৳{Number(p.discount_price ?? p.price ?? 0).toLocaleString()} ·{" "}
                          {p.platform}
                          {p.suggested_subcategory
                            ? ` · ${p.suggested_subcategory}`
                            : ""}
                        </p>

                        {p.duplicate_reason && (
                          <p className="mt-1 text-xs text-nexora-coral">
                            {p.duplicate_reason}
                          </p>
                        )}
                        {!!p.missing_fields?.length && (
                          <p className="mt-1 text-xs font-semibold text-nexora-amber">
                            Required: {p.missing_fields.join(", ")}
                          </p>
                        )}
                        {p.ai_note && (
                          <p className="mt-1 text-[11px] text-nexora-muted">
                            {p.ai_note}
                          </p>
                        )}

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <label className="text-xs text-nexora-muted">
                            Nexora category
                            <select
                              value={p.category || ""}
                              onChange={(e) =>
                                patchProduct(p, { category: e.target.value })
                              }
                              className="mt-1 h-10 w-full rounded-lg border border-nexora-border bg-white px-3 text-sm text-nexora-ink outline-none focus:border-nexora-emerald"
                            >
                              <option value="">Choose category</option>
                              {categories.map((c) => (
                                <option key={c.slug} value={c.slug}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="flex items-end">
                            <button
                              onClick={() =>
                                patchProduct(p, { ignored: !p.ignored })
                              }
                              disabled={p.duplicate}
                              className="nx-btn-ghost h-10 w-full justify-center"
                            >
                              {p.ignored ? (
                                <CheckCircle2 size={14} />
                              ) : (
                                <CircleX size={14} />
                              )}
                              {p.ignored ? "Include" : "Ignore"}
                            </button>
                          </div>
                        </div>

                        {(needsVariants || needsCoreEdit) && (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {needsCoreEdit && (
                              <>
                                <input
                                  value={draft.price ?? ""}
                                  onChange={(e) =>
                                    setDraftDetails((prev) => ({
                                      ...prev,
                                      [p.source_key]: {
                                        ...draft,
                                        price: e.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Price"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="h-10 rounded-lg border border-nexora-border px-3 text-xs outline-none focus:border-nexora-emerald"
                                />
                                <input
                                  value={draft.image_url ?? ""}
                                  onChange={(e) =>
                                    setDraftDetails((prev) => ({
                                      ...prev,
                                      [p.source_key]: {
                                        ...draft,
                                        image_url: e.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Product image URL"
                                  className="h-10 rounded-lg border border-nexora-border px-3 text-xs outline-none focus:border-nexora-emerald"
                                />
                              </>
                            )}
                            {needsVariants && (
                              <>
                                <input
                                  value={draft.sizes ?? ""}
                                  onChange={(e) =>
                                    setDraftDetails((prev) => ({
                                      ...prev,
                                      [p.source_key]: {
                                        ...draft,
                                        sizes: e.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Sizes: S, M, L, XL"
                                  className="h-10 rounded-lg border border-nexora-border px-3 text-xs outline-none focus:border-nexora-emerald"
                                />
                                <input
                                  value={draft.colors ?? ""}
                                  onChange={(e) =>
                                    setDraftDetails((prev) => ({
                                      ...prev,
                                      [p.source_key]: {
                                        ...draft,
                                        colors: e.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Colors: Black, White"
                                  className="h-10 rounded-lg border border-nexora-border px-3 text-xs outline-none focus:border-nexora-emerald"
                                />
                              </>
                            )}
                            <button
                              onClick={() => saveDetails(p)}
                              className="nx-btn-ghost h-10 justify-center sm:col-span-2"
                            >
                              Save required details
                            </button>
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
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#F2EDFF] text-[#6A4FD6]">
                <Bot size={18} />
              </div>
              <div>
                <p className="font-extrabold text-nexora-ink">
                  Nexora Import AI
                </p>
                <p className="text-[11px] text-nexora-muted">
                  Continuous catalogue assistant
                </p>
              </div>
            </div>

            <div className="mt-4 max-h-[440px] space-y-2 overflow-y-auto rounded-xl bg-[#FAFCFB] p-3">
              {chatHistory.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl p-3 text-xs leading-5 ${
                    m.role === "user"
                      ? "ml-6 bg-[#6A4FD6] text-white"
                      : "mr-4 bg-white text-nexora-ink"
                  }`}
                >
                  {m.message}
                </div>
              ))}
              {chatBusy && (
                <div className="mr-4 rounded-xl bg-white p-3 text-xs text-nexora-muted">
                  Checking your catalogue…
                </div>
              )}
            </div>

            <form onSubmit={sendChat} className="mt-3 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="e.g. only fashion / show incomplete"
                className="min-w-0 flex-1 rounded-xl border border-nexora-border px-3 text-xs outline-none focus:border-nexora-emerald"
              />
              <button
                disabled={chatBusy || !chatInput.trim()}
                className="grid h-10 w-10 place-items-center rounded-xl bg-[#6A4FD6] text-white disabled:opacity-50"
              >
                {chatBusy ? (
                  <RefreshCw size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
              </button>
            </form>

            <div className="mt-3 rounded-xl bg-[#F8FAF9] p-3 text-[10px] leading-4 text-nexora-muted">
              Try: <b>show incomplete</b>, <b>show duplicates</b>,{" "}
              <b>ignore hoodie</b>, <b>only pets</b>,{" "}
              <b>select all ready</b>, or{" "}
              <b>put all panjabi under fashion</b>.
            </div>
          </aside>
        </div>
      )}

      {profile?.website_url && !isFacebookUrl(profile.website_url) && (
        <section className="rounded-2xl border border-nexora-border bg-white p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Zap className="text-nexora-amber" size={19} />
                <h2 className="font-extrabold text-nexora-ink">
                  Connected website sync
                </h2>
              </div>
              <p className="mt-1 text-sm text-nexora-muted">
                {profile.website_url}
              </p>
              <p className="mt-1 text-xs text-nexora-muted">
                Every {profile.interval_hours || 6} hours · supported title,
                price, stock, description and image changes can stay synchronized.
              </p>
              {profile.last_sync_at && (
                <p className="mt-1 text-xs text-nexora-muted">
                  Last sync: {new Date(profile.last_sync_at).toLocaleString()}
                </p>
              )}
              {profile.last_sync_error && (
                <p className="mt-1 text-xs text-nexora-coral">
                  Last sync error: {profile.last_sync_error}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={syncNow}
                disabled={syncing}
                className="nx-btn-ghost"
              >
                <RefreshCw
                  size={15}
                  className={syncing ? "animate-spin" : ""}
                />
                {syncing ? "Syncing..." : "Sync now"}
              </button>
              <button
                onClick={() => saveSync(!profile.auto_sync)}
                className={
                  profile.auto_sync ? "nx-btn-ghost" : "nx-btn-primary"
                }
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
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold ${tone}`}
    >
      <Icon size={11} />
      {text}
    </span>
  );
}
