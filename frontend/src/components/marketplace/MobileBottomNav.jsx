import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, LayoutGrid, Search, ShoppingBag, User } from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { useAuth } from "@/context/AuthContext";

export default function MobileBottomNav() {
  const { pathname } = useLocation();
  const { cartCount } = useStore();
  const { user } = useAuth();
  const items = [
    { to: "/", icon: Home, label: "Home", key: "/" },
    { to: "/products", icon: LayoutGrid, label: "Categories", key: "/products" },
    { to: "/search", icon: Search, label: "Search", key: "/search", center: true },
    { to: "/cart", icon: ShoppingBag, label: "Cart", key: "/cart", badge: cartCount },
    { to: user ? (user.role === "seller" ? "/seller/dashboard" : "/account") : "/login", icon: User, label: "Account", key: "/account" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-nexora-border bg-white/95 shadow-[0_-8px_30px_rgba(23,33,27,.06)] backdrop-blur-md md:hidden" data-testid="mobile-bottom-nav">
      <div className="flex items-stretch justify-around">
        {items.map((item) => {
          const active = item.key === "/" ? pathname === "/" : pathname.startsWith(item.key);
          return (
            <Link key={item.label} to={item.to} className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${active ? "text-nexora-emerald" : "text-nexora-muted"}`} data-testid={`bottomnav-${item.label.toLowerCase()}`}>
              <span className={item.center ? "-mt-4 grid h-11 w-11 place-items-center rounded-full bg-nexora-emerald text-white shadow-lg shadow-emerald-900/10" : "grid h-7 w-7 place-items-center"}>
                <item.icon size={item.center ? 21 : 20} />
              </span>
              {item.badge > 0 && <span className="absolute right-1/2 top-0 translate-x-4 grid h-4 min-w-4 place-items-center rounded-full bg-nexora-coral px-1 text-[9px] font-bold text-white">{item.badge}</span>}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
