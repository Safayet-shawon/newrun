import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Search, Heart, ShoppingBag, User, Menu, X, Store, Tag, LayoutGrid, ChevronDown } from "lucide-react";
import { Logo } from "@/components/shared/Bits";
import { useStore } from "@/context/StoreContext";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cartCount, wishlist } = useStore();
  const { user, logout } = useAuth();
  const [q, setQ] = useState("");
  const [cats, setCats] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);

  useEffect(() => {
    api.get("/categories").then(({ data }) => setCats(data)).catch(() => {});
  }, []);
  useEffect(() => { setMenuOpen(false); setCatOpen(false); }, [location.pathname]);

  const submitSearch = (e) => {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const accountLink = user ? (user.role === "seller" ? "/seller/dashboard" : "/account") : "/login";

  return (
    <header className="sticky top-0 z-40 border-b border-nexora-border bg-white/95 backdrop-blur-md">
      {/* top strip */}
      <div className="hidden bg-nexora-mintbg text-nexora-emeraldDark md:block">
        <div className="nx-container flex h-9 items-center justify-between text-xs font-medium">
          <span>Free delivery across Bangladesh on orders over ৳2,000</span>
          <div className="flex items-center gap-4">
            <Link to="/seller/signup" className="hover:text-nexora-emerald" data-testid="become-seller-link">Sell on NEXORA</Link>
            <span className="text-nexora-border">|</span>
            <span>Help Center</span>
          </div>
        </div>
      </div>

      <div className="nx-container flex h-16 items-center gap-4">
        <button className="md:hidden" onClick={() => setMenuOpen(true)} data-testid="mobile-menu-open" aria-label="Menu">
          <Menu size={24} className="text-nexora-ink" />
        </button>
        <Logo />

        <form onSubmit={submitSearch} className="relative mx-2 hidden flex-1 md:block" data-testid="search-form">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products, brands and shops…"
            className="h-11 w-full rounded-full border border-nexora-border bg-nexora-warm pl-11 pr-4 text-sm outline-none transition-colors focus:border-nexora-emerald focus:bg-white"
            data-testid="search-input"
          />
        </form>

        <nav className="hidden items-center gap-1 lg:flex">
          <div className="relative" onMouseEnter={() => setCatOpen(true)} onMouseLeave={() => setCatOpen(false)}>
            <button className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-nexora-ink hover:text-nexora-emerald" data-testid="nav-categories">
              <LayoutGrid size={16} /> Categories <ChevronDown size={14} />
            </button>
            {catOpen && (
              <div className="absolute left-0 top-full w-56 rounded-2xl border border-nexora-border bg-white p-2 shadow-lg">
                {cats.map((c) => (
                  <Link key={c.slug} to={`/category/${c.slug}`} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-nexora-ink hover:bg-nexora-mintbg" data-testid={`nav-cat-${c.slug}`}>
                    {c.name} <span className="text-xs text-nexora-muted">{c.product_count}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <Link to="/shops" className="rounded-full px-3 py-2 text-sm font-medium text-nexora-ink hover:text-nexora-emerald" data-testid="nav-shops">Shops</Link>
          <Link to="/deals" className="rounded-full px-3 py-2 text-sm font-medium text-nexora-coral hover:opacity-80" data-testid="nav-deals">Deals</Link>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Link to="/wishlist" className="relative grid h-10 w-10 place-items-center rounded-full text-nexora-ink hover:bg-nexora-mintbg" data-testid="nav-wishlist" aria-label="Wishlist">
            <Heart size={20} />
            {wishlist.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-nexora-coral px-1 text-[10px] font-bold text-white" style={{ height: 18, minWidth: 18 }}>{wishlist.length}</span>}
          </Link>
          <Link to="/cart" className="relative grid h-10 w-10 place-items-center rounded-full text-nexora-ink hover:bg-nexora-mintbg" data-testid="nav-cart" aria-label="Cart">
            <ShoppingBag size={20} />
            {cartCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid place-items-center rounded-full bg-nexora-emerald px-1 text-[10px] font-bold text-white" style={{ height: 18, minWidth: 18 }}>{cartCount}</span>}
          </Link>
          {user ? (
            <div className="group relative">
              <button className="flex items-center gap-2 rounded-full border border-nexora-border py-1.5 pl-1.5 pr-3 hover:border-nexora-emerald" data-testid="nav-account">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-nexora-emerald text-xs font-bold text-white">{user.name?.[0]?.toUpperCase()}</span>
                <span className="hidden text-sm font-medium sm:block">{user.name?.split(" ")[0]}</span>
              </button>
              <div className="invisible absolute right-0 top-full w-48 rounded-2xl border border-nexora-border bg-white p-2 opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">
                <Link to={accountLink} className="block rounded-xl px-3 py-2 text-sm hover:bg-nexora-mintbg" data-testid="account-menu-dashboard">{user.role === "seller" ? "Seller Dashboard" : "My Account"}</Link>
                {user.role !== "seller" && <Link to="/account/orders" className="block rounded-xl px-3 py-2 text-sm hover:bg-nexora-mintbg">My Orders</Link>}
                <button onClick={() => { logout(); navigate("/"); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-nexora-coral hover:bg-[#FFEDE5]" data-testid="logout-btn">Log out</button>
              </div>
            </div>
          ) : (
            <Link to="/login" className="ml-1 hidden items-center gap-1.5 rounded-full bg-nexora-emerald px-4 py-2 text-sm font-semibold text-white hover:bg-nexora-emeraldDark sm:flex" data-testid="nav-login">
              <User size={16} /> Sign in
            </Link>
          )}
        </div>
      </div>

      {/* mobile search */}
      <div className="border-t border-nexora-border p-3 md:hidden">
        <form onSubmit={submitSearch} className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search NEXORA…" className="h-11 w-full rounded-full border border-nexora-border bg-nexora-warm pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" data-testid="mobile-search-input" />
        </form>
      </div>

      {/* mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-nexora-ink/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-80 max-w-[85%] overflow-y-auto bg-white p-5">
            <div className="mb-6 flex items-center justify-between">
              <Logo />
              <button onClick={() => setMenuOpen(false)} data-testid="mobile-menu-close"><X size={24} /></button>
            </div>
            <Link to="/shops" className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium hover:bg-nexora-mintbg"><Store size={18} /> Shops</Link>
            <Link to="/deals" className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium text-nexora-coral hover:bg-nexora-mintbg"><Tag size={18} /> Deals</Link>
            <p className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-nexora-muted">Categories</p>
            {cats.map((c) => (
              <Link key={c.slug} to={`/category/${c.slug}`} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-nexora-mintbg">{c.name}</Link>
            ))}
            <div className="mt-6 border-t border-nexora-border pt-4">
              {!user && <Link to="/login" className="nx-btn-primary w-full">Sign in</Link>}
              <Link to="/seller/signup" className="mt-2 block text-center text-sm font-medium text-nexora-emerald">Sell on NEXORA →</Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
