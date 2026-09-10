import React from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, ShieldCheck, Store, Truck } from "lucide-react";
import { Logo } from "@/components/shared/Bits";

export default function AuthShell({ title, subtitle, children, side = "customer" }) {
  const isSeller = side === "seller";

  return (
    <div className="min-h-screen bg-nexora-warm lg:grid lg:grid-cols-[minmax(480px,.85fr)_1.15fr]">
      <div className="flex min-h-screen flex-col bg-white px-6 py-7 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between">
          <Logo showTagline />
          <Link to="/" className="text-xs font-bold text-nexora-emerald hover:text-nexora-emeraldDark">Back to marketplace →</Link>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <span className="mb-3 inline-flex w-fit rounded-full bg-nexora-mintbg px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.15em] text-nexora-emeraldDark">
            {isSeller ? "Seller access" : "Your Nexora"}
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-nexora-ink sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-nexora-muted">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>

        <p className="text-center text-[11px] text-nexora-muted">Secure access to NEXORA · Built for Bangladesh</p>
      </div>

      <div className={`relative hidden min-h-screen overflow-hidden lg:block ${isSeller ? "bg-[#FFFBF5]" : "bg-nexora-mintbg"}`}>
        <div className="absolute inset-0 opacity-70" style={{ backgroundImage: "radial-gradient(circle at 18% 20%, rgba(255,255,255,.95), transparent 28%), radial-gradient(circle at 80% 70%, rgba(15,138,104,.12), transparent 34%)" }} />
        <div className="relative flex h-full flex-col justify-center px-12 xl:px-20">
          {isSeller ? (
            <div className="max-w-2xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-nexora-emerald">Sell on NEXORA</p>
              <h2 className="mt-3 text-4xl font-extrabold leading-tight text-nexora-ink xl:text-5xl">Your own shop.<br />Inside a smarter digital mall.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-nexora-muted">Manage products, orders, storefront design, customers and growth tools from one trusted seller workspace.</p>
              <div className="mt-7 grid grid-cols-3 gap-3">
                {[["START", "Start selling"], ["GROW", "Grow your business"], ["PRO", "Nexora Intelligence"]].map(([name, copy], index) => (
                  <div key={name} className={`rounded-2xl border p-4 ${index === 2 ? "border-[#F1D795] bg-[#FFF8E8]" : "border-[#CDEFE2] bg-white/75"}`}>
                    <p className={`text-xs font-extrabold ${index === 2 ? "text-nexora-amber" : "text-nexora-emerald"}`}>{name}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-nexora-ink">{copy}</p>
                  </div>
                ))}
              </div>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <span className="flex items-center gap-2 rounded-2xl bg-white/70 px-4 py-3 text-xs font-semibold text-nexora-muted"><Store size={17} className="text-nexora-emerald" /> Independent storefront</span>
                <span className="flex items-center gap-2 rounded-2xl bg-white/70 px-4 py-3 text-xs font-semibold text-nexora-muted"><BadgeCheck size={17} className="text-nexora-emerald" /> Marketplace trust layer</span>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-nexora-emerald">Welcome to NEXORA</p>
              <h2 className="mt-3 text-4xl font-extrabold leading-tight text-nexora-ink xl:text-5xl">Products, shops and brands.<br />One marketplace.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-nexora-muted">Discover independent stores, save products, follow shops and manage every order from one account.</p>
              <img src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1000&q=85" alt="Marketplace shopping" className="mt-7 h-64 w-full rounded-3xl object-cover shadow-xl shadow-emerald-950/5" />
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[[ShieldCheck, "Secure shopping"], [BadgeCheck, "Verified sellers"], [Truck, "Nationwide delivery"]].map(([Icon, label]) => (
                  <span key={label} className="flex items-center justify-center gap-2 rounded-2xl bg-white/75 px-3 py-3 text-xs font-semibold text-nexora-muted"><Icon size={16} className="text-nexora-emerald" /> {label}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function GoogleButton({ role = "customer", label = "Continue with Google" }) {
  const startGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = `${window.location.origin}/auth/callback?ctx=${role}`;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <button type="button" onClick={startGoogle} data-testid="google-auth-btn" className="flex w-full items-center justify-center gap-2 rounded-xl border border-nexora-border bg-white py-2.5 text-sm font-semibold text-nexora-ink transition-colors hover:border-nexora-emerald hover:bg-nexora-mintbg">
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="h-5 w-5" />
      {label}
    </button>
  );
}
