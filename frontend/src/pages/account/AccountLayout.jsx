import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutGrid, Package, MapPin, User, Heart, Clock, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const LINKS = [
  { to: "/account", icon: LayoutGrid, label: "Overview", end: true },
  { to: "/account/orders", icon: Package, label: "Orders" },
  { to: "/account/wishlist", icon: Heart, label: "Wishlist" },
  { to: "/account/recently-viewed", icon: Clock, label: "Recently viewed" },
  { to: "/account/addresses", icon: MapPin, label: "Addresses" },
  { to: "/account/profile", icon: User, label: "Profile" },
];

export default function AccountLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="nx-container py-8 animate-fade-in">
      <div className="mb-6 flex items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-nexora-emerald text-xl font-extrabold text-white">{user?.name?.[0]?.toUpperCase()}</div>
        <div>
          <h1 className="text-2xl font-extrabold text-nexora-ink">Hello, {user?.name?.split(" ")[0]}</h1>
          <p className="text-sm text-nexora-muted">{user?.email}</p>
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-4">
        <aside className="lg:col-span-1">
          <div className="flex gap-2 overflow-x-auto rounded-2xl border border-nexora-border bg-white p-2 no-scrollbar lg:flex-col">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} data-testid={`account-nav-${l.label.toLowerCase().replace(/ /g, "-")}`}
                className={({ isActive }) => `flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium ${isActive ? "bg-nexora-mintbg text-nexora-emeraldDark" : "text-nexora-muted hover:bg-nexora-mintbg/60"}`}>
                <l.icon size={18} /> {l.label}
              </NavLink>
            ))}
            <button onClick={() => { logout(); navigate("/"); }} className="flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium text-nexora-coral hover:bg-[#FFEDE5]" data-testid="account-logout"><LogOut size={18} /> Log out</button>
          </div>
        </aside>
        <div className="lg:col-span-3"><Outlet /></div>
      </div>
    </div>
  );
}
