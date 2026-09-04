import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, LayoutGrid, Heart, ShoppingBag, User } from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { useAuth } from "@/context/AuthContext";

export default function MobileBottomNav() {
  const { pathname } = useLocation();
  const { cartCount, wishlist } = useStore();
  const { user } = useAuth();
  const items = [
    { to: "/", icon: Home, label: "Home", key: "/" },
    { to: "/shops", icon: LayoutGrid, label: "Shops", key: "/shops" },
    { to: "/cart", icon: ShoppingBag, label: "Cart", key: "/cart", badge: cartCount },
    { to: "/wishlist", icon: Heart, label: "Saved", key: "/wishlist", badge: wishlist.length },
    { to: user ? (user.role === "seller" ? "/seller/dashboard" : "/account") : "/login", icon: User, label: "Account", key: "/account" },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-nexora-border bg-white/95 backdrop-blur-md md:hidden" data-testid="mobile-bottom-nav">
      <div className="flex items-stretch justify-around">
        {items.map((it) => {
          const active = it.key === "/" ? pathname === "/" : pathname.startsWith(it.key);
          return (
            <Link key={it.label} to={it.to} className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${active ? "text-nexora-emerald" : "text-nexora-muted"}`} data-testid={`bottomnav-${it.label.toLowerCase()}`}>
              <it.icon size={21} />
              {it.badge > 0 && <span className="absolute right-1/2 top-1 translate-x-3 grid place-items-center rounded-full bg-nexora-coral px-1 text-[9px] font-bold text-white" style={{ height: 15, minWidth: 15 }}>{it.badge}</span>}
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
