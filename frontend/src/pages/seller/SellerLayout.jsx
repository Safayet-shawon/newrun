import React, { useState } from "react";
import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Package, PlusCircle, Boxes, Store, Palette,
  CreditCard, Wallet, Users, Star, BarChart3, Settings, Bell, Menu, X, ExternalLink,
  Eye, LogOut, ChevronDown, Sparkles, Globe2, Lock,
} from "lucide-react";
import { Logo, Loader } from "@/components/shared/Bits";
import { SellerProvider, useSeller } from "@/context/SellerContext";
import { useAuth } from "@/context/AuthContext";
import { PLAN_META } from "@/lib/entitlements";

const NAV = [
  { to: "/seller/dashboard", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/seller/dashboard/orders", icon: ShoppingCart, label: "Orders" },
  { to: "/seller/dashboard/products", icon: Package, label: "Products" },
  { to: "/seller/dashboard/products/new", icon: PlusCircle, label: "Add Product" },
  { to: "/seller/dashboard/inventory", icon: Boxes, label: "Inventory" },
  { to: "/seller/dashboard/store", icon: Store, label: "Store" },
  { to: "/seller/dashboard/themes", icon: Palette, label: "Themes" },
  { to: "/seller/dashboard/subscription", icon: CreditCard, label: "Subscription" },
  { to: "/seller/dashboard/wallet", icon: Wallet, label: "Nexora Wallet" },
  { to: "/seller/dashboard/customers", icon: Users, label: "Customers" },
  { to: "/seller/dashboard/reviews", icon: Star, label: "Reviews" },
  { to: "/seller/dashboard/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/seller/dashboard/intelligence", icon: Sparkles, label: "Nexora Intelligence", feature: "marketplace_intelligence" },
  { to: "/seller/dashboard/import-store", icon: Globe2, label: "Import Store", feature: "store_import" },
  { to: "/seller/dashboard/settings", icon: Settings, label: "Settings" },
  { to: "/seller/dashboard/notifications", icon: Bell, label: "Notifications" },
];

function Shell() {
  const { loading, shop, plan, dashboardTheme, ent } = useSeller();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (loading) return <div className="min-h-screen bg-nexora-warm"><Loader label="Loading dashboard" /></div>;
  const published = shop?.status === "published";
  const planMeta = plan ? PLAN_META[plan.id] : null;

  const Sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-nexora-border px-5 py-4">
        <Logo showTagline />
        <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close seller menu"><X size={22} /></button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV.map((n) => {
          const locked = n.feature && !ent?.[n.feature];
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              data-testid={`seller-nav-${n.label.toLowerCase().replace(/ /g, "-")}`}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "text-white" : "hover:bg-nexora-mintbg"}`}
              style={({ isActive }) => isActive
                ? { backgroundColor: dashboardTheme?.primary_color || "#0F8A68" }
                : { color: dashboardTheme?.sidebar_text_color || "#66736B" }}
            >
              <n.icon size={18} />
              <span className="min-w-0 flex-1 truncate">{n.label}</span>
              {locked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3E2] px-1.5 py-0.5 text-[9px] font-extrabold text-nexora-amber">
                  <Lock size={9} /> PRO
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {planMeta && (
        <Link to="/seller/dashboard/subscription" className="mx-3 mb-3 rounded-2xl border border-[#CDEFE2] bg-nexora-mintbg p-3" data-testid="sidebar-plan">
          <p className="text-xs text-nexora-muted">Current plan</p>
          <p className="text-lg font-extrabold" style={{ color: planMeta.color }}>{planMeta.name}</p>
          <p className="mt-1 text-xs font-medium text-nexora-emerald">{planMeta.tagline}</p>
          <p className="mt-1 text-xs font-medium text-nexora-emerald">Manage plan →</p>
        </Link>
      )}
    </div>
  );

  return (
    <div
      className="min-h-screen bg-nexora-warm"
      data-seller-dashboard
      style={{
        backgroundColor: dashboardTheme?.surface_color || undefined,
        color: dashboardTheme?.text_color || undefined,
        fontFamily: dashboardTheme?.font_family === "serif" ? "Georgia,serif" : undefined,
        "--seller-radius": `${dashboardTheme?.border_radius || 14}px`,
      }}
    >
      <aside
        className="fixed inset-y-0 left-0 hidden w-64 border-r border-nexora-border bg-white lg:block"
        style={{
          backgroundColor: dashboardTheme?.sidebar_color || undefined,
          color: dashboardTheme?.sidebar_text_color || undefined,
        }}
      >
        {Sidebar}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-nexora-ink/35 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-0 h-full w-64 bg-white shadow-2xl"
            style={{
              backgroundColor: dashboardTheme?.sidebar_color || undefined,
              color: dashboardTheme?.sidebar_text_color || undefined,
            }}
          >
            {Sidebar}
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-nexora-border bg-white/95 px-4 backdrop-blur sm:px-6">
          <button className="grid h-9 w-9 place-items-center rounded-xl border border-nexora-border lg:hidden" onClick={() => setOpen(true)} data-testid="seller-menu-open"><Menu size={20} /></button>

          <div className="hidden sm:block">
            <p className="text-sm font-bold text-nexora-ink">{shop?.name || "Your shop"}</p>
            <p className="text-xs text-nexora-muted">{published ? "Published & live" : "Draft — not visible to customers"}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {planMeta && (
              <span className="hidden rounded-full px-2.5 py-1 text-xs font-extrabold sm:inline-flex" style={{ color: planMeta.color, backgroundColor: `${planMeta.color}18` }}>
                {planMeta.name}
              </span>
            )}

            {shop && (
              <a href={`/shop/${shop.slug}`} target="_blank" rel="noreferrer" className="nx-btn-ghost hidden sm:inline-flex" data-testid="view-my-store">
                <Eye size={15} /> View my store <ExternalLink size={13} />
              </a>
            )}

            <div className="group relative">
              <button className="flex items-center gap-2 rounded-full border border-nexora-border bg-white py-1.5 pl-1.5 pr-2.5" data-testid="seller-account-menu">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-nexora-emerald text-xs font-bold text-white">{user?.name?.[0]?.toUpperCase()}</span>
                <ChevronDown size={14} className="text-nexora-muted" />
              </button>
              <div className="invisible absolute right-0 top-full z-40 w-44 rounded-2xl border border-nexora-border bg-white p-2 opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">
                <Link to="/" className="block rounded-xl px-3 py-2 text-sm hover:bg-nexora-mintbg">Marketplace</Link>
                <button onClick={() => { logout(); navigate("/"); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-nexora-coral hover:bg-[#FFEDE5]" data-testid="seller-logout">
                  <LogOut size={15} /> Log out
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}

export default function SellerLayout() {
  return (
    <SellerProvider>
      <Shell />
    </SellerProvider>
  );
}
