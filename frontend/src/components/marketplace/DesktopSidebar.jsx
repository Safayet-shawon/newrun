import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home, LayoutGrid, Heart, Store, Tag, Percent, User, LogIn,
  ShieldCheck, CreditCard, Truck, Users, ChevronRight
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

export default function DesktopSidebar() {
  const location = useLocation();
  return (
    <aside className="sticky top-0 hidden h-screen w-[258px] shrink-0 border-r border-nexora-border bg-white xl:flex xl:flex-col">
      <div className="flex h-[72px] items-center border-b border-nexora-border px-5">
        <Logo className="scale-95 origin-left" />
      </div>

      <nav className="px-3 py-3">
        {items.map(([to, label, Icon], i) => {
          const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to.split("?")[0]);
          return (
            <Link
              key={label}
              to={to}
              className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold transition ${active ? "bg-nexora-mintbg text-nexora-emeraldDark" : "text-nexora-ink hover:bg-[#F6FAF8]"}`}
            >
              <Icon size={19} strokeWidth={1.9} />
              <span className="flex-1">{label}</span>
              {[1,2,3,4,5,6].includes(i) && <ChevronRight size={16} className="text-nexora-muted" />}
              {label === "Deals" && <span className="rounded-full bg-[#FF5E57] px-2 py-0.5 text-[10px] font-bold text-white">Hot</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 mt-auto rounded-2xl bg-gradient-to-br from-[#ECFDF5] to-[#E8F8F5] p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-nexora-emerald shadow-sm"><Store size={22}/></div>
          <div><p className="text-xs font-bold text-nexora-ink">Join NEXORA</p><p className="text-lg font-extrabold leading-tight text-nexora-emeraldDark">Be a Seller</p></div>
        </div>
        <p className="text-xs leading-5 text-nexora-muted">Start your own shop and reach customers across Bangladesh.</p>
        <Link to="/seller/signup" className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-nexora-emerald px-3 py-2.5 text-xs font-bold text-white">Become a Seller <ChevronRight size={14}/></Link>
      </div>

      <div className="space-y-2 px-5 py-4 text-[12px] text-nexora-muted">
        <p className="flex items-center gap-2"><ShieldCheck size={16} className="text-nexora-emerald"/> Trusted Marketplace</p>
        <p className="flex items-center gap-2"><CreditCard size={16} className="text-nexora-emerald"/> Secure Payments</p>
        <p className="flex items-center gap-2"><Truck size={16} className="text-nexora-emerald"/> Nationwide Delivery</p>
        <p className="flex items-center gap-2"><Users size={16} className="text-nexora-emerald"/> Support Local Businesses</p>
      </div>
    </aside>
  );
}
