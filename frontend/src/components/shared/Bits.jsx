import React from "react";
import { Star, Loader2, PackageOpen } from "lucide-react";
import { Link } from "react-router-dom";

export function Logo({ className = "", light = false }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`} data-testid="nexora-logo">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-nexora-emerald text-white font-extrabold text-lg shadow-sm">N</span>
      <span className={`text-xl font-extrabold tracking-tight ${light ? "text-white" : "text-nexora-ink"}`}>
        NEXORA
      </span>
    </Link>
  );
}

export function RatingStars({ value = 0, count, size = 14, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Star size={size} className="fill-nexora-amber text-nexora-amber" />
      <span className="font-semibold text-nexora-ink text-sm">{Number(value).toFixed(1)}</span>
      {count != null && <span className="text-nexora-muted text-xs">({count})</span>}
    </span>
  );
}

export function Loader({ label = "Loading" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-nexora-muted" data-testid="loader">
      <Loader2 className="animate-spin text-nexora-emerald" size={28} />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function EmptyState({ title, description, action, icon: Icon = PackageOpen }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-nexora-border bg-white/60 py-16 px-6 text-center" data-testid="empty-state">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-nexora-mintbg text-nexora-emerald">
        <Icon size={26} />
      </div>
      <h3 className="text-lg font-semibold text-nexora-ink">{title}</h3>
      {description && <p className="max-w-sm text-sm text-nexora-muted">{description}</p>}
      {action}
    </div>
  );
}

export function Badge({ children, tone = "emerald", className = "" }) {
  const tones = {
    emerald: "bg-nexora-mintbg text-nexora-emeraldDark",
    coral: "bg-[#FFEDE5] text-nexora-coral",
    amber: "bg-[#FEF3E2] text-nexora-amber",
    ink: "bg-nexora-ink text-white",
    muted: "bg-[#F1F5F3] text-nexora-muted",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function SectionHeader({ eyebrow, title, action }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-nexora-emerald">{eyebrow}</p>}
        <h2 className="text-2xl font-bold tracking-tight text-nexora-ink sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}
