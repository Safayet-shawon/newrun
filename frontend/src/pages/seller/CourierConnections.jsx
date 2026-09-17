import React, { useEffect, useState } from "react";
import { KeyRound, RefreshCw, Trash2, Truck } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import { toast } from "sonner";

const EMPTY = {
  pathao: { client_id: "", client_secret: "", username: "", password: "", store_id: "" },
  steadfast: { api_key: "", secret_key: "" },
  redx: { access_token: "", pickup_store_id: "" },
};

const META = {
  pathao: { title: "Pathao", help: "Use Developer API credentials from your Pathao merchant account." },
  steadfast: { title: "Steadfast", help: "Use your merchant API Key and Secret Key." },
  redx: { title: "RedX", help: "Use your RedX API access token and optional pickup store ID." },
};

export default function CourierConnections() {
  const [connections, setConnections] = useState(null);
  const [forms, setForms] = useState(EMPTY);
  const [busy, setBusy] = useState("");

  const load = async () => {
    try { const { data } = await api.get("/seller/integrations/couriers"); setConnections(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, []);

  const set = (provider, key, value) => setForms((all) => ({ ...all, [provider]: { ...all[provider], [key]: value } }));

  const connect = async (provider) => {
    setBusy(provider);
    try {
      const payload = Object.fromEntries(Object.entries(forms[provider]).filter(([, v]) => String(v || "").trim()));
      await api.put(`/seller/integrations/couriers/${provider}`, payload);
      setForms((all) => ({ ...all, [provider]: { ...EMPTY[provider] } }));
      toast.success(`${META[provider].title} connected and tested`);
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(""); }
  };

  const test = async (provider) => {
    setBusy(provider);
    try { await api.post(`/seller/integrations/couriers/${provider}/test`); toast.success(`${META[provider].title} connection is working`); await load(); }
    catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(""); }
  };

  const disconnect = async (provider) => {
    setBusy(provider);
    try { await api.delete(`/seller/integrations/couriers/${provider}`); toast.success(`${META[provider].title} disconnected`); await load(); }
    catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(""); }
  };

  if (!connections) return <Loader label="Loading courier connections" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-extrabold uppercase tracking-[.2em] text-nexora-emerald">Courier Network</p><h1 className="mt-1 text-2xl font-extrabold text-nexora-ink">Connect real courier accounts</h1><p className="mt-1 max-w-3xl text-sm text-nexora-muted">Credentials are encrypted before storage. Nexora uses them only for connection checks, order booking and tracking.</p></div>
        <button onClick={load} className="nx-btn-ghost"><RefreshCw size={15}/> Refresh</button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {Object.keys(META).map((provider) => {
          const info = connections[provider] || {};
          const connected = info.status === "connected";
          return (
            <section key={provider} className="rounded-2xl border border-nexora-border bg-white p-5">
              <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Truck size={18} className="text-nexora-emerald"/><h2 className="text-lg font-extrabold text-nexora-ink">{META[provider].title}</h2></div><p className="mt-1 text-xs text-nexora-muted">{META[provider].help}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase ${connected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{connected ? "Connected" : "Not connected"}</span></div>

              {connected ? (
                <div className="mt-5 space-y-3 rounded-xl bg-nexora-mintbg p-4"><p className="text-sm font-bold text-nexora-ink">Account {info.masked_account || "connected"}</p><p className="text-xs text-nexora-muted">Last tested: {info.last_tested_at ? new Date(info.last_tested_at).toLocaleString() : "—"}</p><div className="flex gap-2"><button disabled={busy === provider} onClick={() => test(provider)} className="nx-btn-primary flex-1">Test</button><button disabled={busy === provider} onClick={() => disconnect(provider)} className="nx-btn-ghost text-nexora-coral"><Trash2 size={15}/></button></div></div>
              ) : (
                <div className="mt-5 space-y-3">
                  {provider === "pathao" && <><Secret label="Client ID" value={forms.pathao.client_id} onChange={(v)=>set(provider,"client_id",v)}/><Secret label="Client secret" value={forms.pathao.client_secret} onChange={(v)=>set(provider,"client_secret",v)} password/><Secret label="Username / merchant email" value={forms.pathao.username} onChange={(v)=>set(provider,"username",v)}/><Secret label="Password" value={forms.pathao.password} onChange={(v)=>set(provider,"password",v)} password/><Secret label="Store ID (optional)" value={forms.pathao.store_id} onChange={(v)=>set(provider,"store_id",v)}/></>}
                  {provider === "steadfast" && <><Secret label="API key" value={forms.steadfast.api_key} onChange={(v)=>set(provider,"api_key",v)} password/><Secret label="Secret key" value={forms.steadfast.secret_key} onChange={(v)=>set(provider,"secret_key",v)} password/></>}
                  {provider === "redx" && <><Secret label="API access token" value={forms.redx.access_token} onChange={(v)=>set(provider,"access_token",v)} password/><Secret label="Pickup store ID (optional)" value={forms.redx.pickup_store_id} onChange={(v)=>set(provider,"pickup_store_id",v)}/></>}
                  <button disabled={busy === provider} onClick={() => connect(provider)} className="nx-btn-primary w-full"><KeyRound size={15}/> {busy === provider ? "Checking…" : "Connect & test"}</button>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Security:</b> Nexora never sends courier credentials to the browser after saving them. Disconnecting removes the encrypted credential record. Keep provider credentials private and rotate them from the courier portal if you suspect exposure.</div>
    </div>
  );
}

function Secret({ label, value, onChange, password = false }) {
  return <label className="block"><span className="mb-1 block text-xs font-bold text-nexora-muted">{label}</span><input type={password ? "password" : "text"} autoComplete="off" value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-nexora-border px-3 py-2 text-sm outline-none focus:border-nexora-emerald" /></label>;
}
