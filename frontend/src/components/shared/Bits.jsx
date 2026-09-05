import React from "react";
import { Star, Loader2, PackageOpen } from "lucide-react";
import { Link } from "react-router-dom";

export function Logo({ className = "", light = false, showTagline = false }) {
  const textColor = light ? "text-white" : "text-[#11201A]";
  return (
    <Link to="/" className={`inline-flex items-center gap-2.5 ${className}`} data-testid="nexora-logo" aria-label="NEXORA home">
      <svg viewBox="0 0 42 34" className="h-8 w-10 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id="nxLogoGreen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#10B981" />
            <stop offset="1" stopColor="#0A8F68" />
          </linearGradient>
          <linearGradient id="nxLogoCoral" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF8B79" />
            <stop offset="1" stopColor="#FF6B6B" />
          </linearGradient>
        </defs>
        <path d="M3 6.5C3 3.46 5.46 1 8.5 1h1.1c3.08 0 5.92 1.66 7.43 4.34L21 12.4v14.1c0 3.04-2.46 5.5-5.5 5.5h-.8c-3.04 0-5.5-2.46-5.5-5.5V14.7L5.73 9.64A5.52 5.52 0 0 1 3 6.5Z" fill="url(#nxLogoGreen)"/>
        <path d="M39 27.5c0 3.04-2.46 5.5-5.5 5.5h-1.1c-3.08 0-5.92-1.66-7.43-4.34L21 21.6V7.5C21 4.46 23.46 2 26.5 2h.8c3.04 0 5.5 2.46 5.5 5.5v11.8l3.47 5.06A5.52 5.52 0 0 1 39 27.5Z" fill="url(#nxLogoGreen)"/>
        <path d="M21 7.5C21 4.46 23.46 2 26.5 2h.8c3.04 0 5.5 2.46 5.5 5.5v11.8L21 12.4V7.5Z" fill="url(#nxLogoCoral)"/>
      </svg>
      <span className="min-w-0 leading-none">
        <span className={`block text-[21px] font-extrabold tracking-[-0.045em] ${textColor}`}>NEXORA</span>
        {showTagline && <span className={`mt-1 block whitespace-nowrap text-[8px] font-medium tracking-tight ${light ? "text-white/70" : "text-[#758179]"}`}>More People. More Possibilities.</span>}
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
