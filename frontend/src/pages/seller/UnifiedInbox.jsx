import React, { useEffect, useMemo, useState } from "react";
import { Copy, Link2, MessageCircle, Plus, Send, Settings2, ShoppingBag, Smartphone, Trash2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Loader } from "@/components/shared/Bits";
import { toast } from "sonner";

const providerIcon = (provider) => provider === "whatsapp" ? Smartphone : MessageCircle;
const providerName = (provider) => provider === "whatsapp" ? "WhatsApp" : "Messenger";

export default function UnifiedInbox() {
  const [connections, setConnections] = useState(null);
  const [conversations, setConversations] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [thread, setThread] = useState(null);
  const [products, setProducts] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectForm, setConnectForm] = useState({ provider: "whatsapp", external_account_id: "", access_token: "", display_name: "" });
  const [checkoutItems, setCheckoutItems] = useState([]);
  const [checkoutNote, setCheckoutNote] = useState("");
  const [latestLink, setLatestLink] = useState("");

  const load = async () => {
    try {
      const [{ data: c }, { data: v }, { data: p }] = await Promise.all([
        api.get("/seller/inbox/connections"),
        api.get("/seller/inbox/conversations"),
        api.get("/seller/products?status=published"),
      ]);
      setConnections(c);
      setConversations(v);
      setProducts(p.items || []);
      if (!selectedId && v[0]?.id) setSelectedId(v[0].id);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedId) { setThread(null); return; }
    api.get(`/seller/inbox/conversations/${selectedId}/messages`).then(({ data }) => setThread(data)).catch((e) => toast.error(formatApiError(e)));
  }, [selectedId]);

  const selected = useMemo(() => conversations?.find((c) => c.id === selectedId), [conversations, selectedId]);

  const saveConnection = async () => {
    try {
      await api.post("/seller/inbox/connections", connectForm);
      setConnectOpen(false);
      setConnectForm({ provider: "whatsapp", external_account_id: "", access_token: "", display_name: "" });
      toast.success("Channel connected");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const disconnect = async (id) => {
    try {
      await api.delete(`/seller/inbox/connections/${id}`);
      toast.success("Channel disconnected");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const sendMessage = async (messageText = text) => {
    if (!selectedId || !messageText.trim()) return;
    setSending(true);
    try {
      const { data } = await api.post(`/seller/inbox/conversations/${selectedId}/messages`, { text: messageText.trim() });
      setThread((old) => ({ ...old, messages: [...(old?.messages || []), data] }));
      setText("");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSending(false); }
  };

  const toggleProduct = (product) => {
    setCheckoutItems((rows) => {
      if (rows.find((r) => r.product_id === product.id)) return rows.filter((r) => r.product_id !== product.id);
      return [...rows, { product_id: product.id, qty: 1, title: product.title }];
    });
  };

  const setQty = (productId, qty) => setCheckoutItems((rows) => rows.map((r) => r.product_id === productId ? { ...r, qty: Math.max(1, Number(qty) || 1) } : r));

  const createCheckout = async (sendNow = false) => {
    if (!checkoutItems.length) return toast.error("Select at least one product");
    try {
      const { data } = await api.post("/seller/inbox/checkout-links", {
        conversation_id: selectedId || null,
        items: checkoutItems.map(({ product_id, qty }) => ({ product_id, qty })),
        expires_hours: 48,
        note: checkoutNote,
      });
      setLatestLink(data.url);
      await navigator.clipboard?.writeText(data.url).catch(() => {});
      toast.success("Instant checkout link created and copied");
      if (sendNow && selectedId) await sendMessage(`Complete your order securely: ${data.url}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (!connections || !conversations) return <Loader label="Loading commerce inbox" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-nexora-ink">Unified Commerce Inbox</h1>
          <p className="mt-1 max-w-3xl text-sm text-nexora-muted">Handle Messenger and WhatsApp conversations beside customer context, then turn a chat into a checkout link without rebuilding the order manually.</p>
        </div>
        <button onClick={() => setConnectOpen((v) => !v)} className="nx-btn-primary"><Plus size={15} /> Connect channel</button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {["messenger", "whatsapp"].map((provider) => {
          const Icon = providerIcon(provider);
          const rows = connections.filter((c) => c.provider === provider);
          return (
            <div key={provider} className="rounded-2xl border border-nexora-border bg-white p-4">
              <div className="flex items-center gap-2"><Icon size={19} className="text-nexora-emerald" /><p className="font-extrabold text-nexora-ink">{providerName(provider)}</p></div>
              {rows.length ? rows.map((row) => <div key={row.id} className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-nexora-warm p-3"><div><p className="text-sm font-bold text-nexora-ink">{row.display_name}</p><p className="text-xs text-nexora-muted">Account ID: {row.external_account_id}</p></div><button onClick={() => disconnect(row.id)} className="grid h-9 w-9 place-items-center rounded-xl border border-nexora-border text-nexora-coral"><Trash2 size={15} /></button></div>) : <p className="mt-3 text-sm text-nexora-muted">Not connected yet.</p>}
            </div>
          );
        })}
      </div>

      {connectOpen && (
        <section className="rounded-3xl border border-nexora-border bg-white p-5">
          <div className="flex items-center gap-2"><Settings2 size={18} /><h2 className="font-extrabold text-nexora-ink">Connect Meta channel</h2></div>
          <p className="mt-1 text-xs text-nexora-muted">Use the Page ID or WhatsApp Phone Number ID and a valid Meta access token. Tokens are encrypted before storage. OAuth connection can replace this manual setup later.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select value={connectForm.provider} onChange={(e) => setConnectForm((f) => ({ ...f, provider: e.target.value }))} className="h-12 rounded-xl border border-nexora-border px-4 text-sm outline-none"><option value="whatsapp">WhatsApp Business</option><option value="messenger">Facebook Messenger</option></select>
            <input value={connectForm.display_name} onChange={(e) => setConnectForm((f) => ({ ...f, display_name: e.target.value }))} placeholder="Display name" className="h-12 rounded-xl border border-nexora-border px-4 text-sm outline-none" />
            <input value={connectForm.external_account_id} onChange={(e) => setConnectForm((f) => ({ ...f, external_account_id: e.target.value }))} placeholder={connectForm.provider === "whatsapp" ? "Phone Number ID" : "Facebook Page ID"} className="h-12 rounded-xl border border-nexora-border px-4 text-sm outline-none" />
            <input type="password" value={connectForm.access_token} onChange={(e) => setConnectForm((f) => ({ ...f, access_token: e.target.value }))} placeholder="Meta access token" className="h-12 rounded-xl border border-nexora-border px-4 text-sm outline-none" />
          </div>
          <button onClick={saveConnection} className="nx-btn-primary mt-4">Save connection</button>
        </section>
      )}

      <div className="grid min-h-[620px] overflow-hidden rounded-3xl border border-nexora-border bg-white lg:grid-cols-[300px_1fr_330px]">
        <aside className="border-b border-nexora-border lg:border-b-0 lg:border-r">
          <div className="border-b border-nexora-border p-4"><p className="font-extrabold text-nexora-ink">Conversations</p><p className="text-xs text-nexora-muted">{conversations.length} active threads</p></div>
          <div className="max-h-[560px] overflow-y-auto">
            {!conversations.length && <p className="p-5 text-sm text-nexora-muted">New Messenger or WhatsApp messages will appear here after the Meta webhook is connected.</p>}
            {conversations.map((c) => {
              const Icon = providerIcon(c.provider);
              return <button key={c.id} onClick={() => setSelectedId(c.id)} className={`w-full border-b border-nexora-border p-4 text-left ${selectedId === c.id ? "bg-nexora-mintbg" : "hover:bg-nexora-warm"}`}><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-nexora-emerald"><Icon size={17} /></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-bold text-nexora-ink">{c.customer_name}</p>{c.unread_count > 0 && <span className="rounded-full bg-nexora-emerald px-2 py-0.5 text-[10px] font-bold text-white">{c.unread_count}</span>}</div><p className="mt-1 truncate text-xs text-nexora-muted">{c.last_message}</p></div></div></button>;
            })}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          {selected ? <>
            <div className="border-b border-nexora-border p-4"><p className="font-extrabold text-nexora-ink">{selected.customer_name}</p><p className="text-xs text-nexora-muted">{providerName(selected.provider)} · {selected.external_customer_id}</p></div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-nexora-warm/60 p-4">
              {(thread?.messages || []).map((message) => <div key={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}><div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm ${message.direction === "outbound" ? "bg-nexora-emerald text-white" : "border border-nexora-border bg-white text-nexora-ink"}`}><p className="whitespace-pre-wrap">{message.text}</p><p className={`mt-1 text-[10px] ${message.direction === "outbound" ? "text-white/70" : "text-nexora-muted"}`}>{new Date(message.created_at).toLocaleString()}</p></div></div>)}
              {thread && !(thread.messages || []).length && <p className="text-sm text-nexora-muted">No messages loaded yet.</p>}
            </div>
            <div className="flex gap-2 border-t border-nexora-border p-3"><textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply to customer…" className="min-h-12 flex-1 resize-none rounded-xl border border-nexora-border px-4 py-3 text-sm outline-none focus:border-nexora-emerald" /><button onClick={() => sendMessage()} disabled={sending || !text.trim()} className="nx-btn-primary self-end"><Send size={15} /> Send</button></div>
          </> : <div className="grid flex-1 place-items-center p-8 text-center text-sm text-nexora-muted">Select a conversation to start selling from chat.</div>}
        </section>

        <aside className="border-t border-nexora-border p-4 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-2"><ShoppingBag size={18} className="text-nexora-emerald" /><h2 className="font-extrabold text-nexora-ink">Instant Checkout</h2></div>
          <p className="mt-1 text-xs leading-5 text-nexora-muted">Select products, generate a secure 48-hour checkout link, then send it directly in the conversation.</p>
          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {products.map((product) => {
              const row = checkoutItems.find((r) => r.product_id === product.id);
              return <div key={product.id} className={`rounded-xl border p-3 ${row ? "border-nexora-emerald bg-nexora-mintbg" : "border-nexora-border"}`}><button onClick={() => toggleProduct(product)} className="w-full text-left"><p className="line-clamp-1 text-sm font-bold text-nexora-ink">{product.title}</p><p className="text-xs text-nexora-muted">৳{Number(product.discount_price ?? product.price).toLocaleString("en-BD")} · Stock {product.stock}</p></button>{row && <input type="number" min="1" max={product.stock} value={row.qty} onChange={(e) => setQty(product.id, e.target.value)} className="mt-2 h-9 w-20 rounded-lg border border-nexora-border bg-white px-2 text-sm" />}</div>;
            })}
          </div>
          <textarea value={checkoutNote} onChange={(e) => setCheckoutNote(e.target.value)} rows={3} placeholder="Optional note for this checkout" className="mt-3 w-full rounded-xl border border-nexora-border p-3 text-sm outline-none" />
          <div className="mt-3 grid gap-2"><button onClick={() => createCheckout(false)} className="nx-btn-ghost justify-center"><Link2 size={15} /> Create & copy link</button><button onClick={() => createCheckout(true)} disabled={!selectedId} className="nx-btn-primary justify-center"><Send size={15} /> Create & send</button></div>
          {latestLink && <div className="mt-3 rounded-xl bg-nexora-warm p-3"><p className="break-all text-xs text-nexora-muted">{latestLink}</p><button onClick={() => navigator.clipboard?.writeText(latestLink)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-nexora-emerald"><Copy size={13} /> Copy again</button></div>}
        </aside>
      </div>
    </div>
  );
}
