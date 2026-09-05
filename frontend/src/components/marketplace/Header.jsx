import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Search,
  Heart,
  ShoppingBag,
  User,
  Menu,
  X,
  Store,
  Tag,
  LayoutGrid,
  MapPin,
  Home,
  LogOut,
} from "lucide-react";
import { Logo } from "@/components/shared/Bits";
import { useStore } from "@/context/StoreContext";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

export default function Header({ onToggleDesktopSidebar }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { cartCount, wishlist } = useStore();
  const { user, logout } = useAuth();

  const [q, setQ] = useState("");
  const [cats, setCats] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api
      .get("/categories")
      .then(({ data }) => setCats(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const submitSearch = (event) => {
    event.preventDefault();
    if (!q.trim()) return;
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const accountLink = user
    ? user.role === "seller"
      ? "/seller/dashboard"
      : "/account"
    : "/login";

  return (
    <header className="sticky top-0 z-40 border-b border-nexora-border bg-white/95 backdrop-blur-xl">
      <div className="nx-container flex h-[66px] items-center gap-3 sm:gap-4">
        {/* DESKTOP + MOBILE LEFT MENU */}
        <button
          onClick={() => setMenuOpen(true)}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-nexora-border bg-white text-nexora-ink transition hover:border-nexora-emerald hover:bg-nexora-mintbg hover:text-nexora-emerald"
          aria-label="Open menu"
          data-testid="marketplace-menu-open"
        >
          <Menu size={21} />
        </button>

        <Logo className="shrink-0" />

        {/* MAIN SEARCH */}
        <form
          onSubmit={submitSearch}
          className="relative mx-1 hidden min-w-0 flex-1 md:block"
          data-testid="search-form"
        >
          <Search
            size={17}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted"
          />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search for products, brands, or shops..."
            className="h-11 w-full rounded-xl border border-nexora-border bg-[#FBFDFC] pl-11 pr-12 text-sm text-nexora-ink outline-none transition focus:border-nexora-emerald focus:bg-white focus:ring-2 focus:ring-nexora-emerald/10"
            data-testid="search-input"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 grid h-8 w-9 -translate-y-1/2 place-items-center rounded-lg bg-nexora-emerald text-white transition hover:bg-nexora-emeraldDark"
            aria-label="Search"
          >
            <Search size={16} />
          </button>
        </form>

        {/* DELIVERY */}
        <div className="hidden shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 xl:flex">
          <MapPin size={18} className="text-nexora-ink" />
          <div className="leading-tight">
            <p className="text-[10px] text-nexora-muted">Deliver to</p>
            <p className="text-xs font-bold text-nexora-ink">Dhaka</p>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="ml-auto flex items-center gap-1">
          <Link
            to="/wishlist"
            className="relative grid h-10 w-10 place-items-center rounded-full text-nexora-ink transition hover:bg-nexora-mintbg"
            aria-label="Wishlist"
          >
            <Heart size={20} />
            {wishlist.length > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 grid place-items-center rounded-full bg-nexora-coral px-1 text-[10px] font-bold text-white"
                style={{ height: 18, minWidth: 18 }}
              >
                {wishlist.length}
              </span>
            )}
          </Link>

          <Link
            to="/cart"
            className="relative grid h-10 w-10 place-items-center rounded-full text-nexora-ink transition hover:bg-nexora-mintbg"
            aria-label="Cart"
          >
            <ShoppingBag size={20} />
            {cartCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 grid place-items-center rounded-full bg-nexora-emerald px-1 text-[10px] font-bold text-white"
                style={{ height: 18, minWidth: 18 }}
              >
                {cartCount}
              </span>
            )}
          </Link>

          {user ? (
            <Link
              to={accountLink}
              className="ml-1 grid h-10 w-10 place-items-center rounded-full border border-nexora-border bg-white text-sm font-bold text-nexora-ink transition hover:border-nexora-emerald"
              aria-label="Account"
            >
              {user.name?.[0]?.toUpperCase() || <User size={18} />}
            </Link>
          ) : (
            <Link
              to="/login"
              className="ml-1 hidden h-10 items-center gap-1.5 rounded-full border border-nexora-border bg-white px-3 text-sm font-semibold text-nexora-ink transition hover:border-nexora-emerald hover:text-nexora-emerald sm:flex"
            >
              <User size={16} /> Sign in
            </Link>
          )}
        </div>
      </div>

      {/* MOBILE SEARCH */}
      <div className="border-t border-nexora-border px-4 py-2.5 md:hidden">
        <form onSubmit={submitSearch} className="relative">
          <Search
            size={17}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted"
          />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search NEXORA..."
            className="h-10 w-full rounded-xl border border-nexora-border bg-[#FBFDFC] pl-11 pr-11 text-sm outline-none focus:border-nexora-emerald"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 grid h-7 w-8 -translate-y-1/2 place-items-center rounded-lg bg-nexora-emerald text-white"
            aria-label="Search"
          >
            <Search size={14} />
          </button>
        </form>
      </div>

      {/* LEFT SLIDE MENU */}
      {menuOpen && (
        <div className="fixed inset-0 z-[80]">
          <button
            className="absolute inset-0 h-full w-full bg-nexora-ink/35 backdrop-blur-[1px]"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          />

          <aside className="absolute left-0 top-0 h-[100dvh] w-[310px] max-w-[88vw] overflow-y-auto border-r border-nexora-border bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-nexora-border pb-4">
              <Logo />
              <button
                onClick={() => setMenuOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full text-nexora-muted transition hover:bg-nexora-mintbg hover:text-nexora-ink"
                aria-label="Close menu"
              >
                <X size={21} />
              </button>
            </div>

            <nav className="mt-4 space-y-1">
              <Link
                to="/"
                className="flex items-center gap-3 rounded-xl bg-nexora-mintbg px-3 py-3 text-sm font-bold text-nexora-emeraldDark"
              >
                <Home size={18} /> Home
              </Link>

              <Link
                to="/products"
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-nexora-ink transition hover:bg-nexora-mintbg"
              >
                <LayoutGrid size={18} /> All products
              </Link>

              <Link
                to="/shops"
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-nexora-ink transition hover:bg-nexora-mintbg"
              >
                <Store size={18} /> Shops
              </Link>

              <Link
                to="/deals"
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-nexora-coral transition hover:bg-[#FFF3EC]"
              >
                <Tag size={18} /> Deals
              </Link>

              <Link
                to={accountLink}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-nexora-ink transition hover:bg-nexora-mintbg"
              >
                <User size={18} /> {user ? "My account" : "Login / Sign up"}
              </Link>
            </nav>

            <div className="mt-5 border-t border-nexora-border pt-5">
              <p className="px-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-nexora-muted">
                Categories
              </p>

              <div className="mt-2 grid grid-cols-2 gap-1">
                {cats.slice(0, 10).map((category) => (
                  <Link
                    key={category.slug}
                    to={`/category/${category.slug}`}
                    className="rounded-xl px-3 py-2.5 text-sm font-medium text-nexora-ink transition hover:bg-nexora-mintbg hover:text-nexora-emeraldDark"
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[#CDEFE2] bg-nexora-mintbg p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-nexora-emerald shadow-sm">
                  <Store size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.13em] text-nexora-emeraldDark">
                    Join NEXORA
                  </p>
                  <h3 className="mt-1 text-lg font-extrabold text-nexora-ink">
                    Be a seller
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-nexora-muted">
                    Create your own shop and reach customers across Bangladesh.
                  </p>
                </div>
              </div>

              <Link
                to="/seller/signup"
                className="mt-4 flex h-10 items-center justify-center rounded-xl bg-nexora-emerald text-sm font-bold text-white transition hover:bg-nexora-emeraldDark"
              >
                Become a seller
              </Link>
            </div>

            <div className="mt-5 space-y-2 px-2 text-xs font-medium text-nexora-muted">
              <p className="flex items-center gap-2">
                <ShieldDot /> Trusted marketplace
              </p>
              <p className="flex items-center gap-2">
                <ShieldDot /> Secure payments
              </p>
              <p className="flex items-center gap-2">
                <ShieldDot /> Nationwide delivery
              </p>
            </div>

            {user && (
              <button
                onClick={() => {
                  logout();
                  navigate("/");
                  setMenuOpen(false);
                }}
                className="mt-5 flex w-full items-center gap-3 rounded-xl border border-nexora-border px-3 py-3 text-sm font-semibold text-nexora-coral transition hover:bg-[#FFF3EC]"
              >
                <LogOut size={18} /> Log out
              </button>
            )}
          </aside>
        </div>
      )}
    </header>
  );
}

function ShieldDot() {
  return (
    <span className="grid h-5 w-5 place-items-center rounded-full bg-nexora-mintbg text-[10px] font-black text-nexora-emerald">
      ✓
    </span>
  );
}
