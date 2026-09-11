import React, { useEffect, useState } from "react";
import { Plus, Trash2, MapPin, Star } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/shared/Bits";
import { toast } from "sonner";

const BLANK = {
  label: "Home",
  full_name: "",
  phone: "",
  address: "",
  address_line2: "",
  area: "",
  city: "",
  state: "",
  postal_code: "",
  country_code: "BD",
  is_default: false,
};

export default function AccountAddresses() {
  const [addresses, setAddresses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);

  const load = () => api.get("/account/addresses").then(({ data }) => setAddresses(data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.phone || !form.address || !form.city || !form.country_code) {
      toast.error("Fill name, phone, street, city and country code");
      return;
    }
    await api.post("/account/addresses", { ...form, country_code: form.country_code.toUpperCase() });
    toast.success("Address saved");
    setForm(BLANK);
    setShowForm(false);
    load();
  };

  const remove = async (id) => { await api.delete(`/account/addresses/${id}`); load(); };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-nexora-ink">Saved addresses</h2><p className="mt-1 text-sm text-nexora-muted">Use ISO country codes such as BD, US, GB, IT, FI or AU.</p></div>
        <button onClick={() => setShowForm((s) => !s)} className="nx-btn-primary" data-testid="add-address-btn"><Plus size={16} /> Add address</button>
      </div>

      {showForm && (
        <form onSubmit={save} className="mb-5 grid gap-3 rounded-2xl border border-nexora-border bg-white p-5 sm:grid-cols-2" data-testid="address-form">
          {[
            ["full_name", "Full name"], ["phone", "Phone with country code"], ["address", "Street address"],
            ["address_line2", "Apartment / suite (optional)"], ["area", "Area / district"], ["city", "City"],
            ["state", "State / province"], ["postal_code", "Postal / ZIP code"], ["country_code", "Country code (BD/US/GB…)"], ["label", "Label (Home/Office)"],
          ].map(([k, l]) => (
            <input key={k} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: k === "country_code" ? e.target.value.toUpperCase().slice(0, 2) : e.target.value }))} placeholder={l} className="rounded-xl border border-nexora-border p-3 text-sm outline-none focus:border-nexora-emerald" data-testid={`address-${k}`} />
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
              <p className="text-sm text-nexora-muted">{[a.address, a.address_line2, a.area, a.city, a.state, a.postal_code, a.country_code].filter(Boolean).join(", ")}</p>
              <button onClick={() => remove(a.id)} className="absolute right-3 top-3 text-nexora-muted hover:text-nexora-coral" data-testid={`delete-address-${a.id}`}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
