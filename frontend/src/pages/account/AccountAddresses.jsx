import React, { useEffect, useState } from "react";
import { Plus, Trash2, MapPin, Star } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/shared/Bits";
import { toast } from "sonner";

const BLANK = { label: "Home", full_name: "", phone: "", address: "", area: "", city: "Dhaka", is_default: false };

export default function AccountAddresses() {
  const [addresses, setAddresses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);

  const load = () => api.get("/account/addresses").then(({ data }) => setAddresses(data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.phone || !form.address) { toast.error("Fill name, phone and address"); return; }
    await api.post("/account/addresses", form);
    toast.success("Address saved");
    setForm(BLANK); setShowForm(false); load();
  };
  const remove = async (id) => { await api.delete(`/account/addresses/${id}`); load(); };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold text-nexora-ink">Saved addresses</h2>
        <button onClick={() => setShowForm((s) => !s)} className="nx-btn-primary" data-testid="add-address-btn"><Plus size={16} /> Add address</button>
      </div>

      {showForm && (
        <form onSubmit={save} className="mb-5 grid gap-3 rounded-2xl border border-nexora-border bg-white p-5 sm:grid-cols-2" data-testid="address-form">
          {[["full_name", "Full name"], ["phone", "Phone"], ["address", "Street address"], ["area", "Area"], ["city", "City"], ["label", "Label (Home/Office)"]].map(([k, l]) => (
            <input key={k} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder={l} className="rounded-xl border border-nexora-border p-3 text-sm outline-none focus:border-nexora-emerald" data-testid={`address-${k}`} />
          ))}
          <label className="flex items-center gap-2 text-sm text-nexora-muted"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))} /> Set as default</label>
          <div className="sm:col-span-2"><button className="nx-btn-primary" data-testid="save-address">Save address</button></div>
        </form>
      )}

      {addresses.length === 0 ? <EmptyState icon={MapPin} title="No addresses yet" description="Add a delivery address for faster checkout." /> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {addresses.map((a) => (
            <div key={a.id} className="relative rounded-2xl border border-nexora-border bg-white p-4" data-testid={`address-card-${a.id}`}>
              <div className="flex items-center gap-2"><span className="rounded-full bg-nexora-mintbg px-2 py-0.5 text-xs font-semibold text-nexora-emeraldDark">{a.label}</span>{a.is_default && <span className="inline-flex items-center gap-1 text-xs text-nexora-amber"><Star size={12} className="fill-nexora-amber" /> Default</span>}</div>
              <p className="mt-2 font-semibold text-nexora-ink">{a.full_name}</p>
              <p className="text-sm text-nexora-muted">{a.phone}</p>
              <p className="text-sm text-nexora-muted">{a.address}, {a.area} {a.city}</p>
              <button onClick={() => remove(a.id)} className="absolute right-3 top-3 text-nexora-muted hover:text-nexora-coral" data-testid={`delete-address-${a.id}`}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
