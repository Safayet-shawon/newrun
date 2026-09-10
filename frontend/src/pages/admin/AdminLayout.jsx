import React from "react";
import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Package,
  Layers3,
  Image,
  Star,
  ShieldCheck,
  Store,
  BadgeDollarSign,
  Clock3,
  BadgePlus,
  TicketPercent,
  Settings,
  LogOut,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";

const NAV = [
  ["/admin/dashboard", LayoutDashboard, "Command Center", true],
  ["/admin/dashboard/people", Users, "People & Access"],
  ["/admin/dashboard/products", Package, "Products & Moderation"],
  ["/admin/dashboard/categories", Layers3, "Categories & Images"],
  ["/admin/dashboard/content", Image, "Site Content & Covers"],
  ["/admin/dashboard/featured", Star, "Featured Shops"],
  ["/admin/dashboard/security", ShieldCheck, "Security & IP Bans"],
  ["/admin/dashboard/sellers", Store, "Seller Subscriptions"],
  ["/admin/dashboard/revenue", BadgeDollarSign, "Revenue & Commission"],
  ["/admin/dashboard/pending", Clock3, "Pending Confirmations"],
  ["/admin/dashboard/subscriptions", BadgePlus, "Add Subscription"],
  ["/admin/dashboard/tokens", TicketPercent, "Subscription Tokens"],
  ["/admin/dashboard/settings", Settings, "Settings"],
];

function AdminLogo() {
  return (
    <svg width="30" height="30" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="nGradAdminReact" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5EEAD4" />
          <stop offset="50%" stopColor="#14B8A6" />
          <stop offset="100%" stopColor="#0F766E" />
        </linearGradient>
      </defs>
      <rect x="28" y="35" width="52" height="148" rx="14" fill="url(#nGradAdminReact)" />
      <rect x="120" y="35" width="52" height="148" rx="14" fill="url(#nGradAdminReact)" />
      <polygon points="80,35 120,120 120,35" fill="url(#nGradAdminReact)" />
      <polygon points="80,35 120,183 80,183" fill="#0F766E" opacity="0.35" />
      <path d="M55 22 Q100 2 145 22" fill="none" stroke="#E2E8F0" strokeWidth="13" strokeLinecap="round" />
      <circle cx="55" cy="22" r="8" fill="#E2E8F0" />
      <circle cx="145" cy="22" r="8" fill="#E2E8F0" />
    </svg>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/admin/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className="z-30 w-full bg-[#0F2A2E] md:fixed md:left-0 md:top-0 md:h-screen md:w-[240px]">
        <Link to="/admin/dashboard" className="flex h-16 items-center gap-2 border-b border-white/10 px-5 no-underline">
          <AdminLogo />
          <div className="leading-none">
            <div className="text-base font-extrabold text-white">ne<span className="text-teal-300">x</span>ora</div>
            <div className="mt-1 text-[8px] font-semibold tracking-[2px] text-slate-400">OWNER CONTROL</div>
          </div>
        </Link>

        <div className="hidden px-4 pt-4 text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-500 md:block">Platform control</div>
        <nav className="flex gap-1 overflow-x-auto p-2.5 md:block md:max-h-[calc(100vh-155px)] md:space-y-1 md:overflow-y-auto md:py-3">
          {NAV.map(([to, Icon, label, end]) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold no-underline transition-colors ${
                  isActive ? "bg-teal-600 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="hidden md:absolute md:bottom-0 md:left-0 md:block md:w-[240px] md:border-t md:border-white/10 md:bg-[#0F2A2E] md:p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-xs font-semibold text-white">{user?.name || "Owner"}</p>
            <p className="truncate text-[10px] text-slate-400">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-slate-400 transition-colors hover:bg-white/5 hover:text-white">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 sm:p-6 md:ml-[240px] xl:p-8">
        <Outlet />
      </main>
    </div>
  );
}
