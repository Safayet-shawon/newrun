import React, { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

export const money = (n) => `৳${Number(n || 0).toLocaleString("en-BD")}`;
export const dateText = (v) => (v ? new Date(v).toLocaleDateString() : "—");
export const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-teal-500";

export function Header({ title, children }) {
  return <div className="mb-6"><h1 className="text-2xl font-extrabold tracking-tight text-slate-800">{title}</h1>{children && <p className="mt-1 text-sm text-slate-500">{children}</p>}</div>;
}

export function Card({ label, value, tone = "teal" }) {
  const badge = tone === "sky" ? "bg-sky-50 text-sky-700" : tone === "rose" ? "bg-rose-50 text-rose-600" : "bg-teal-50 text-teal-700";
  return <div className="rounded-2xl border border-slate-200 bg-white p-5"><span className={`mb-3 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${badge}`}>{label}</span><div className="text-2xl font-extrabold text-slate-800">{value}</div></div>;
}

export function Empty({ children = "No records found." }) {
  return <div className="p-10 text-center text-sm text-slate-400">{children}</div>;
}

export function useGet(path) {
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get(path).then((r) => setData(r.data)).catch((e) => toast.error(formatApiError(e))), [path]);
  useEffect(() => { load(); }, [load]);
  return [data, load];
}
