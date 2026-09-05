import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home, LayoutGrid, Heart, Store, Tag, Percent, User, LogIn,
  ShieldCheck, CreditCard, Truck, Users, ChevronRight, X
} from "lucide-react";
import { Logo } from "@/components/shared/Bits";

const items = [
  ["/", "Home", Home],
  ["/products", "Categories", LayoutGrid],
  ["/wishlist", "Collections", Heart],
  ["/shops", "Shops", Store],
  ["/products?sort=popular", "Brands", Tag],
  ["/deals", "Deals", Percent],
  ["/account", "Account", User],
  ["/login", "Login / Sign Up", LogIn],
];

export default function DesktopSidebar({ onClose }) {
  const location = useLocation();

  return (
    <aside className="nx-desktop-sidebar sticky top-0 hidden h-screen w-[258px] shrink-0 overflow-y-auto border-r border-[#E6EEEA] bg-white xl:flex xl:flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#EEF2F0] px-5">
        <Logo showTagline className="origin-left scale-[0.92]" />
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#26342D] transition hover:bg-[#F3F7F5]" aria-label="Collapse sidebar">
          <X size={18} />
        </button>
      </div>

      <nav className="px-3 py-3">
        {items.map(([to, label, Icon], i) => {
          const path = to.split("?")[0];
          const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
          return (
            <Link
              key={label}
              to={to}
              className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${active ? "bg-[#EAF7F3] text-[#087A5F]" : "text-[#24322C] hover:bg-[#F6F9F7]"}`}
            >
              <Icon size={18} strokeWidth={1.9} />
              <span className="flex-1">{label}</span>
              {label === "Deals" && <span className="rounded-full bg-[#FF5E57] px-2 py-0.5 text-[9px] font-bold text-white">Hot</span>}
              {[1, 2, 3, 4, 6].includes(i) && <ChevronRight size={15} className="text-[#7B8881]" />}
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 mt-auto rounded-2xl border border-[#DFF2E9] bg-gradient-to-br from-[#ECFDF5] to-[#E8F8F5] p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#0A8D6C] shadow-sm"><Store size={22}/></div>
          <div><p className="text-[10px] font-bold text-[#223029]">Join NEXORA</p><p className="text-lg font-extrabold leading-tight text-[#087A5F]">Be a Seller</p></div>
        </div>
        <p className="text-[11px] leading-[1.55] text-[#647169]">Start your own shop and reach customers across Bangladesh.</p>
        <Link to="/seller/signup" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#0A8D6C] px-3 py-2.5 text-[11px] font-bold text-white">Become a Seller <ChevronRight size={14}/></Link>
      </div>

      <div className="space-y-2 px-5 py-4 text-[11px] text-[#65736B]">
        <p className="flex items-center gap-2"><ShieldCheck size={15} className="text-[#0A8D6C]"/> Trusted Marketplace</p>
        <p className="flex items-center gap-2"><CreditCard size={15} className="text-[#0A8D6C]"/> Secure Payments</p>
        <p className="flex items-center gap-2"><Truck size={15} className="text-[#0A8D6C]"/> Nationwide Delivery</p>
        <p className="flex items-center gap-2"><Users size={15} className="text-[#0A8D6C]"/> Support Local Businesses</p>
      </div>

      <div className="px-5 pb-5 text-center">
        <div className="mx-auto mb-2 h-px w-4/5 bg-gradient-to-r from-transparent via-[#B6E9D8] to-transparent" />
        <p className="text-[10px] leading-5 text-[#65736B]">A Brighter Bangladesh<br/>Through Independent Businesses</p>
        <p className="mt-1 text-[10px] font-semibold text-[#0A8D6C]">♥ Shop Local. Shop Better.</p>
      </div>
    </aside>
  );
}
