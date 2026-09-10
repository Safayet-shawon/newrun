import React from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutGrid, Package, MapPin, User, Heart, Clock, LogOut, Wallet, Store, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const LINKS = [
  { to: "/account", icon: LayoutGrid, label: "Overview", end: true },
  { to: "/account/orders", icon: Package, label: "Orders" },
  { to: "/account/followed-shops", icon: Store, label: "Shops You Follow" },
  { to: "/account/wishlist", icon: Heart, label: "Wishlist" },
  { to: "/account/recently-viewed", icon: Clock, label: "Recently Viewed" },
  { to: "/account/last-purchased", icon: Package, label: "Last Purchased" },
  { to: "/account/wallet", icon: Wallet, label: "Nexora Wallet" },
  { to: "/account/addresses", icon: MapPin, label: "Addresses" },
  { to: "/account/profile", icon: User, label: "Profile" },
];

export default function AccountLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="nx-container py-6 sm:py-8 animate-fade-in">
      <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-nexora-emerald hover:text-nexora-emeraldDark">
        <ArrowLeft size={14} /> Back to marketplace
      </Link>

      <section className="mb-6 overflow-hidden rounded-3xl border border-nexora-border bg-white shadow-sm">
        <div className="flex flex-col gap-4 bg-gradient-to-br from-white via-white to-nexora-mintbg/75 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-nexora-emerald text-xl font-extrabold text-white shadow-sm">
              {user?.name?.[0]?.toUpperCase() || "N"}
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-nexora-emerald">Your Nexora</p>
              <h1 className="mt-1 text-2xl font-extrabold text-nexora-ink">Hello, {user?.name?.split(" ")[0] || "shopper"}</h1>
              <p className="mt-0.5 text-sm text-nexora-muted">{user?.email}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-[#CDEFE2] bg-white/80 px-4 py-3 text-xs text-nexora-muted">
            <b className="block text-sm text-nexora-ink">Everything in one place</b>
            Orders, saved products, followed shops and account details.
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="min-w-0">
          <div className="flex gap-2 overflow-x-auto rounded-2xl border border-nexora-border bg-white p-2 shadow-sm no-scrollbar lg:sticky lg:top-28 lg:flex-col">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                data-testid={`account-nav-${link.label.toLowerCase().replace(/ /g, "-")}`}
                className={({ isActive }) => `flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-nexora-mintbg text-nexora-emeraldDark" : "text-nexora-muted hover:bg-nexora-mintbg/60 hover:text-nexora-ink"}`}
              >
                <link.icon size={17} /> {link.label}
              </NavLink>
            ))}
            <div className="hidden border-t border-nexora-border lg:block" />
            <button onClick={() => { logout(); navigate("/"); }} className="flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium text-nexora-coral transition hover:bg-[#FFF0EA]" data-testid="account-logout">
              <LogOut size={17} /> Log out
            </button>
          </div>
        </aside>

        <div className="min-w-0 rounded-3xl border border-nexora-border bg-white p-4 shadow-sm sm:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
