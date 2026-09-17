import React, { useEffect, useMemo, useState } from "react";
import { BrainCircuit, ShieldCheck, Truck, WalletCards, Users, PlugZap, RefreshCw, Save, Sparkles } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import { toast } from "sonner";

const tabs = [
  ["overview", "Command Center"], ["courier", "Courier Autopilot"], ["fraud", "Fraud Decisions"],
  ["profit", "Profit OS"], ["customers", "Customer 360"], ["copilot", "Seller Copilot"], ["connectors", "Connectors"],
];
const money = (paisa) => `৳${Math.round(Number(paisa || 0) / 100).toLocaleString("en-BD")}`;
const pct = (value) => `${Number(value || 0).toFixed(1)}%`;

export default function SellerGrowthOS() {
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [couriers, setCouriers] = useState(null);
  const [fraud, setFraud] = useState(null);
  const [profitSettings, setProfitSettings] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [connectors, setConnectors] = useState(null);
  const [products, setProducts] = useState([]);
  const [copilotPrompt, setCopilotPrompt] = useState("");
  const [copilotAnswer, setCopilotAnswer] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [o, c, f, p, cu, co, pr] = await Promise.all([
        api.get("/seller/growth/overview"), api.get("/seller/growth/couriers"), api.get("/seller/growth/fraud-rules"),
        api.get("/seller/growth/profit-settings"), api.get("/seller/growth/customers?limit=200"), api.get("/seller/growth/connectors"),
        api.get("/seller/products?status=published"),
      ]);
      setOverview(o.data); setCouriers(c.data); setFraud(f.data); setProfitSettings(p.data);
      setCustomers(cu.data); setConnectors(co.data); setProducts(pr.data.items || []);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const courierForm = useMemo(() => {
    if (!couriers) return null;
    const out = { strategy: couriers.strategy };
    ["pathao", "steadfast", "redx"].forEach((name) => {
      const row = couriers.providers?.[name] || {};
      out[name] = { ...row, base_rate_bdt: row.base_rate_paisa == null ? "" : row.base_rate_paisa / 100 };
    });
    return out;
  }, [couriers]);
  const [courierDraft, setCourierDraft] = useState(null);
  useEffect(() => { if (courierForm) setCourierDraft(courierForm); }, [courierForm]);

  if (loading || !overview) return <Loader label="Loading Nexora Growth OS" />;

  const saveCouriers = async () => {
    setBusy(true);
    try {
      const payload = { strategy: courierDraft.strategy };
      ["pathao", "steadfast", "redx"].forEach((name) => {
        const row = courierDraft[name];
        payload[name] = {
          enabled: !!row.enabled,
          base_rate_bdt: row.base_rate_bdt === "" ? null : Number(row.base_rate_bdt),
          cod_percent: row.cod_percent == null || row.cod_percent === "" ? null : Number(row.cod_percent),
          eta_days: Number(row.eta_days || 2), priority: Number(row.priority || 1), connection_status: row.connection_status || "not_connected",
        };
      });
      const { data } = await api.put("/seller/growth/couriers", payload); setCouriers(data); toast.success("Courier Autopilot updated");
    } catch (e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };

  const saveFraud = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/seller/growth/fraud-rules", {
        otp_score: Number(fraud.otp_score), manual_review_score: Number(fraud.manual_review_score),
        advance_score: Number(fraud.advance_score), block_cod_score: Number(fraud.block_cod_score),
        advance_amount_bdt: Number(fraud.advance_amount_paisa || 0) / 100,
        duplicate_requires_review: !!fraud.duplicate_requires_review,
      });
      setFraud(data); toast.success("Fraud Decision Engine updated");
    } catch (e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };

  const saveProfit = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/seller/growth/profit-settings", {
        monthly_ad_spend_bdt: Number(profitSettings.monthly_ad_spend_bdt || 0),
        product_costs_bdt: Object.fromEntries(Object.entries(profitSettings.product_costs_bdt || {}).map(([k, v]) => [k, Number(v || 0)])),
      });
      setProfitSettings(data); const { data: o } = await api.get("/seller/growth/overview"); setOverview(o);
      toast.success("Profit inputs saved");
    } catch (e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };

  const askCopilot = async (prompt = copilotPrompt) => {
    if (!prompt.trim()) return;
    setBusy(true);
    try { const { data } = await api.post("/seller/growth/copilot", { prompt }); setCopilotAnswer(data); setCopilotPrompt(""); }
    catch (e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-extrabold uppercase tracking-[.2em] text-nexora-emerald">Nexora Growth OS</p><h1 className="mt-1 text-2xl font-extrabold text-nexora-ink">Protect margin. Route smarter. Own the customer.</h1><p className="mt-1 max-w-3xl text-sm text-nexora-muted">A seller control layer for fraud decisions, multi-courier routing, profit visibility, customer intelligence and omnichannel operations.</p></div>
        <button onClick={load} className="nx-btn-ghost"><RefreshCw size={15}/> Refresh</button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">{tabs.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${tab === id ? "bg-nexora-emerald text-white" : "border border-nexora-border bg-white text-nexora-muted"}`}>{label}</button>)}</div>

      {tab === "overview" && <Overview data={overview} setTab={setTab} />}
      {tab === "courier" && courierDraft && <CourierPanel data={couriers} draft={courierDraft} setDraft={setCourierDraft} save={saveCouriers} busy={busy} />}
      {tab === "fraud" && fraud && <FraudPanel fraud={fraud} setFraud={setFraud} save={saveFraud} busy={busy} />}
      {tab === "profit" && profitSettings && <ProfitPanel overview={overview} settings={profitSettings} setSettings={setProfitSettings} products={products} save={saveProfit} busy={busy} />}
      {tab === "customers" && <CustomersPanel data={customers} />}
      {tab === "copilot" && <CopilotPanel prompt={copilotPrompt} setPrompt={setCopilotPrompt} ask={askCopilot} answer={copilotAnswer} busy={busy} />}
      {tab === "connectors" && <ConnectorsPanel data={connectors} setData={setConnectors} busy={busy} setBusy={setBusy} />}
    </div>
  );
}

function Overview({ data, setTab }) {
  const p = data.profit || {};
  const topCourier = data.courier?.recommendations?.[0];
  const cards = [
    [WalletCards, "Realized revenue", money(p.realized_revenue_paisa), "30 days"],
    [Sparkles, "Est. operating profit", money(p.estimated_operating_profit_paisa), `${pct(p.estimated_margin_percent)} margin`],
    [ShieldCheck, "Orders on hold", data.operational_holds || 0, "Fraud / manual review"],
    [Users, "VIP customers", data.customer_segments?.vip || 0, `${data.customer_segments?.repeat || 0} repeat customers`],
  ];
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([Icon, label, value, meta]) => <div key={label} className="rounded-2xl border border-nexora-border bg-white p-4"><Icon size={18} className="text-nexora-emerald"/><p className="mt-3 text-xs font-bold uppercase tracking-wide text-nexora-muted">{label}</p><p className="mt-1 text-2xl font-extrabold text-nexora-ink">{value}</p><p className="mt-1 text-xs text-nexora-muted">{meta}</p></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-3"><ActionCard icon={Truck} title="Courier Autopilot" text={topCourier ? `${topCourier.provider.toUpperCase()} currently ranks first at ${topCourier.score}/100.` : "Configure courier rates and history-aware routing."} onClick={() => setTab("courier")} /><ActionCard icon={ShieldCheck} title="Fraud Decision Engine" text={`${p.fraud_holds || 0} held · ${p.duplicate_flags || 0} duplicate flags in this period.`} onClick={() => setTab("fraud")} /><ActionCard icon={BrainCircuit} title="Seller Copilot" text="Ask your own business data about profit, courier, fraud and restocking." onClick={() => setTab("copilot")} /></div>
    <div className="rounded-2xl border border-[#CDEFE2] bg-nexora-mintbg p-4"><p className="font-extrabold text-nexora-ink">Profit data quality: {p.data_quality || "partial"}</p><p className="mt-1 text-sm text-nexora-muted">Product cost coverage is {pct(p.cost_coverage_percent)}. Add costs and ad spend to make margin intelligence more useful.</p></div></div>;
}

function CourierPanel({ data, draft, setDraft, save, busy }) {
  const mutate = (provider, key, value) => setDraft((d) => ({ ...d, [provider]: { ...d[provider], [key]: value } }));
  return <div className="space-y-4"><section className="rounded-2xl border border-nexora-border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold text-nexora-ink">Multi-courier Autopilot</h2><p className="text-sm text-nexora-muted">Rank Pathao, Steadfast and RedX using your configured cost, speed and delivery history.</p></div><select value={draft.strategy} onChange={(e)=>setDraft((d)=>({...d,strategy:e.target.value}))} className="inp max-w-52"><option value="balanced">Balanced</option><option value="cheapest">Cheapest</option><option value="fastest">Fastest</option><option value="highest_success">Highest success</option></select></div></section>
    <div className="grid gap-4 lg:grid-cols-3">{["pathao","steadfast","redx"].map((name)=>{const row=draft[name]; const stats=data.stats?.[name]||{}; return <div key={name} className="rounded-2xl border border-nexora-border bg-white p-5"><div className="flex items-center justify-between"><p className="text-lg font-extrabold capitalize text-nexora-ink">{name}</p><label className="text-xs font-bold text-nexora-muted"><input type="checkbox" checked={!!row.enabled} onChange={(e)=>mutate(name,"enabled",e.target.checked)} className="mr-2"/>Enabled</label></div><p className="mt-1 text-xs text-nexora-muted">History: {stats.delivered||0} delivered · {stats.failed||0} failed {stats.success_rate!=null?`· ${Math.round(stats.success_rate*100)}% success`:""}</p><div className="mt-4 grid grid-cols-2 gap-2"><MiniInput label="Base rate ৳" value={row.base_rate_bdt} onChange={(v)=>mutate(name,"base_rate_bdt",v)}/><MiniInput label="COD %" value={row.cod_percent??""} onChange={(v)=>mutate(name,"cod_percent",v)}/><MiniInput label="ETA days" value={row.eta_days} onChange={(v)=>mutate(name,"eta_days",v)}/><MiniInput label="Priority 0–2" value={row.priority} onChange={(v)=>mutate(name,"priority",v)}/></div><p className="mt-3 text-xs font-semibold text-nexora-muted">API status: {row.connection_status || "not_connected"}</p></div>})}</div><button onClick={save} disabled={busy} className="nx-btn-primary"><Save size={15}/> Save Autopilot settings</button></div>;
}

function FraudPanel({ fraud, setFraud, save, busy }) {
  const set=(k,v)=>setFraud((f)=>({...f,[k]:v}));
  return <div className="space-y-4"><div className="rounded-2xl border border-nexora-border bg-white p-5"><h2 className="text-lg font-extrabold text-nexora-ink">Fraud Decision Engine</h2><p className="mt-1 text-sm text-nexora-muted">Risk score becomes an action—not just a warning. Thresholds must increase from OTP → review → advance → block COD.</p><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MiniInput label="OTP from score" value={fraud.otp_score} onChange={(v)=>set("otp_score",v)}/><MiniInput label="Manual review from" value={fraud.manual_review_score} onChange={(v)=>set("manual_review_score",v)}/><MiniInput label="Advance from" value={fraud.advance_score} onChange={(v)=>set("advance_score",v)}/><MiniInput label="Block COD from" value={fraud.block_cod_score} onChange={(v)=>set("block_cod_score",v)}/></div><div className="mt-4 flex flex-wrap items-end gap-4"><MiniInput label="Advance amount ৳" value={Number(fraud.advance_amount_paisa||0)/100} onChange={(v)=>set("advance_amount_paisa",Number(v||0)*100)}/><label className="pb-3 text-sm font-bold text-nexora-ink"><input type="checkbox" className="mr-2" checked={!!fraud.duplicate_requires_review} onChange={(e)=>set("duplicate_requires_review",e.target.checked)}/>Duplicate-like orders require review</label></div></div><button onClick={save} disabled={busy} className="nx-btn-primary"><Save size={15}/> Save fraud rules</button></div>;
}

function ProfitPanel({ overview, settings, setSettings, products, save, busy }) {
  const p=overview.profit||{}; const costs=settings.product_costs_bdt||{};
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Revenue" value={money(p.realized_revenue_paisa)}/><Metric label="COGS" value={money(p.cogs_paisa)}/><Metric label="Commission" value={money(p.commission_paisa)}/><Metric label="Est. profit" value={money(p.estimated_operating_profit_paisa)}/></div><div className="rounded-2xl border border-nexora-border bg-white p-5"><h2 className="font-extrabold text-nexora-ink">Profit inputs</h2><p className="mt-1 text-sm text-nexora-muted">Nexora never pretends missing costs are known. Add them here to improve profit accuracy.</p><div className="mt-4 max-w-xs"><MiniInput label="Monthly ad spend ৳" value={settings.monthly_ad_spend_bdt} onChange={(v)=>setSettings((s)=>({...s,monthly_ad_spend_bdt:v}))}/></div><div className="mt-5 grid gap-2 lg:grid-cols-2">{products.slice(0,20).map((product)=><div key={product.id} className="flex items-center gap-3 rounded-xl border border-nexora-border p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-nexora-ink">{product.title}</p><p className="text-xs text-nexora-muted">Sell ৳{Number((product.discount_price ?? product.price) || 0).toLocaleString("en-BD")}</p></div><input type="number" placeholder="Cost ৳" value={costs[product.id]??""} onChange={(e)=>setSettings((s)=>({...s,product_costs_bdt:{...(s.product_costs_bdt||{}),[product.id]:e.target.value}}))} className="inp w-28"/></div>)}</div></div><button onClick={save} disabled={busy} className="nx-btn-primary"><Save size={15}/> Save profit inputs</button></div>;
}

function CustomersPanel({ data }) { const rows=data?.customers||[]; return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="VIP" value={data?.segments?.vip||0}/><Metric label="Repeat" value={data?.segments?.repeat||0}/><Metric label="Risk" value={data?.segments?.risk||0}/><Metric label="New" value={data?.segments?.new||0}/></div><div className="overflow-hidden rounded-2xl border border-nexora-border bg-white"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-nexora-warm text-xs uppercase text-nexora-muted"><tr><th className="p-3">Customer</th><th className="p-3">Segment</th><th className="p-3">Orders</th><th className="p-3">Delivered</th><th className="p-3">LTV</th><th className="p-3">Risk</th><th className="p-3">Channels</th></tr></thead><tbody>{rows.slice(0,100).map((r)=><tr key={r.key} className="border-t border-nexora-border"><td className="p-3"><p className="font-bold text-nexora-ink">{r.name}</p><p className="text-xs text-nexora-muted">{r.phone||r.email||"—"}</p></td><td className="p-3 font-bold">{r.segment}</td><td className="p-3">{r.orders}</td><td className="p-3">{r.delivered}</td><td className="p-3 font-bold">{money(r.lifetime_value_paisa)}</td><td className="p-3">{r.average_risk_score}</td><td className="p-3">{(r.channels||[]).join(", ")}</td></tr>)}</tbody></table></div></div></div>; }

function CopilotPanel({ prompt, setPrompt, ask, answer, busy }) { const quick=["Why are my sales and profit changing?","Which courier looks strongest?","How many risky orders do I have?","What should I restock?"]; return <div className="mx-auto max-w-3xl space-y-4"><div className="rounded-3xl border border-[#CDEFE2] bg-nexora-mintbg p-6"><BrainCircuit size={28} className="text-nexora-emerald"/><h2 className="mt-3 text-xl font-extrabold text-nexora-ink">Ask your business, not a generic chatbot.</h2><p className="mt-1 text-sm text-nexora-muted">Answers use your Nexora orders, margin inputs, courier history, fraud signals and inventory.</p><div className="mt-4 flex flex-wrap gap-2">{quick.map((q)=><button key={q} onClick={()=>ask(q)} className="rounded-full border border-[#CDEFE2] bg-white px-3 py-2 text-xs font-bold text-nexora-ink">{q}</button>)}</div></div>{answer&&<div className="rounded-2xl border border-nexora-border bg-white p-5"><p className="text-sm leading-7 text-nexora-ink">{answer.answer}</p><p className="mt-3 text-xs text-nexora-muted">{answer.note}</p></div>}<div className="flex gap-2"><textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} rows={3} placeholder="Ask: which courier should I prefer, why is profit low, what should I restock…" className="inp flex-1"/><button onClick={()=>ask()} disabled={busy||!prompt.trim()} className="nx-btn-primary self-end"><Sparkles size={15}/> Ask</button></div></div>; }

function ConnectorsPanel({ data, setData, busy, setBusy }) { const types=["website","woocommerce","shopify","facebook_catalog","daraz_csv"]; const map=Object.fromEntries((data?.connectors||[]).map((r)=>[r.source_type,r])); const save=async(type,source_url)=>{setBusy(true);try{const {data:row}=await api.put(`/seller/growth/connectors/${type}`,{source_type:type,enabled:true,source_url:source_url||null,sync_frequency_hours:24});const next=[...(data?.connectors||[]).filter((x)=>x.source_type!==type),row];setData({...data,connectors:next});toast.success(`${type} connector saved`);}catch(e){toast.error(formatApiError(e));}finally{setBusy(false);}}; const sync=async(type)=>{setBusy(true);try{const {data:job}=await api.post(`/seller/growth/connectors/${type}/sync`);setData({...data,latest_sync_job:job});toast.success("Sync job queued");}catch(e){toast.error(formatApiError(e));}finally{setBusy(false);}}; return <div className="space-y-4"><div className="rounded-2xl border border-nexora-border bg-white p-5"><PlugZap size={22} className="text-nexora-emerald"/><h2 className="mt-2 text-lg font-extrabold text-nexora-ink">Omnichannel connector layer</h2><p className="text-sm text-nexora-muted">Keep your own store as the source of truth while Nexora prepares scheduled import/sync adapters.</p></div><div className="grid gap-3 lg:grid-cols-2">{types.map((type)=><ConnectorCard key={type} type={type} row={map[type]} save={save} sync={sync} busy={busy}/>)}</div>{data?.latest_sync_job&&<p className="text-xs text-nexora-muted">Latest sync job: {data.latest_sync_job.source_type} · {data.latest_sync_job.status} · adapter {data.latest_sync_job.adapter_status}</p>}</div>; }

function ConnectorCard({ type, row, save, sync, busy }) { const [url,setUrl]=useState(row?.source_url||""); useEffect(()=>setUrl(row?.source_url||""),[row?.source_url]); return <div className="rounded-2xl border border-nexora-border bg-white p-4"><p className="font-extrabold capitalize text-nexora-ink">{type.replaceAll("_"," ")}</p><p className="mt-1 text-xs text-nexora-muted">{row?.status||"Not configured"}</p><input value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="Source URL (when applicable)" className="inp mt-3"/><div className="mt-3 flex gap-2"><button onClick={()=>save(type,url)} disabled={busy} className="nx-btn-ghost">Save</button><button onClick={()=>sync(type)} disabled={busy||!row} className="nx-btn-primary">Queue sync</button></div></div>; }
function ActionCard({ icon:Icon,title,text,onClick }) { return <button onClick={onClick} className="rounded-2xl border border-nexora-border bg-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-sm"><Icon size={20} className="text-nexora-emerald"/><p className="mt-3 font-extrabold text-nexora-ink">{title}</p><p className="mt-1 text-sm leading-6 text-nexora-muted">{text}</p></button>; }
function Metric({ label,value }) { return <div className="rounded-2xl border border-nexora-border bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-nexora-muted">{label}</p><p className="mt-1 text-xl font-extrabold text-nexora-ink">{value}</p></div>; }
function MiniInput({ label,value,onChange }) { return <label className="block text-xs font-bold text-nexora-muted">{label}<input type="number" value={value??""} onChange={(e)=>onChange(e.target.value)} className="inp mt-1"/></label>; }
