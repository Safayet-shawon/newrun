import React from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/shared/Bits";

export default function AuthShell({ title, subtitle, children, side = "customer" }) {
  const isSeller = side === "seller";
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Logo />
          <h1 className="mt-8 text-3xl font-extrabold tracking-tight text-nexora-ink">{title}</h1>
          <p className="mt-2 text-nexora-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden lg:block" style={{ backgroundColor: isSeller ? "#FFFBF5" : "#ECFDF5" }}>
        <div className="flex h-full flex-col justify-center px-16">
          {isSeller ? (
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-nexora-emerald">Sell on NEXORA</p>
              <h2 className="mt-3 text-4xl font-extrabold leading-tight text-nexora-ink">Build a shop customers trust.</h2>
              <p className="mt-4 max-w-md text-nexora-muted">Your own storefront, product management, category themes and subscription plans from ৳500/month — all designed to look premium out of the box.</p>
              <div className="mt-8 grid grid-cols-3 gap-3">
                {[["START", "৳500"], ["GROW", "৳1,500"], ["PRO", "৳3,000"]].map(([n, p], i) => (
                  <div key={n} className={`rounded-2xl border p-4 text-center ${i === 1 ? "border-nexora-emerald bg-white" : "border-nexora-border bg-white/60"}`}>
                    <p className="text-xs font-bold text-nexora-muted">{n}</p><p className="mt-1 font-extrabold text-nexora-ink">{p}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-nexora-emerald">Welcome to NEXORA</p>
              <h2 className="mt-3 text-4xl font-extrabold leading-tight text-nexora-ink">Shop from thousands of trusted Bangladeshi shops.</h2>
              <p className="mt-4 max-w-md text-nexora-muted">One account for fashion, food, electronics, beauty and more. Save favourites, track orders and check out in seconds.</p>
              <img src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?crop=entropy&cs=srgb&fm=jpg&q=85&w=800" alt="" className="mt-8 h-56 w-full rounded-3xl object-cover shadow-sm" />
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
    <button type="button" onClick={startGoogle} data-testid="google-auth-btn"
      className="flex w-full items-center justify-center gap-2 rounded-full border border-nexora-border bg-white py-2.5 text-sm font-semibold text-nexora-ink transition-colors hover:border-nexora-emerald">
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="h-5 w-5" />
      {label}
    </button>
  );
}
