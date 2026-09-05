import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Search, Heart, ShoppingCart, User, Menu, X, Store, Tag, MapPin, LayoutGrid } from "lucide-react";
import { Logo } from "@/components/shared/Bits";
import { useStore } from "@/context/StoreContext";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cartCount, wishlist } = useStore();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [cats, setCats] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api.get("/categories").then(({ data }) => setCats(data)).catch(() => setCats([]));
  }, []);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const submitSearch = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const accountLink = user ? (user.role === "seller" ? "/seller/dashboard" : "/account") : "/login";

  return (
    <header className="sticky top-0 z-40 border-b border-nexora-border bg-white/95 backdrop-blur-md">
      <div className="flex h-[72px] items-center gap-3 px-3 sm:px-4 lg:px-5">
        <button onClick={() => setMenuOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl bg-[#F1F7F4] text-nexora-ink xl:hidden" aria-label="Open menu">
          <Menu size={21} />
        </button>

        <div className="xl:hidden"><Logo className="scale-90 origin-left" /></div>

        <form onSubmit={submitSearch} className="relative hidden min-w-0 flex-1 md:block">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for products, brands, or shops..."
            className="h-11 w-full rounded-xl border border-[#DDE7E1] bg-white pl-11 pr-14 text-sm outline-none transition focus:border-nexora-emerald focus:ring-2 focus:ring-nexora-emerald/10"
          />
          <button className="absolute right-1.5 top-1/2 grid h-8 w-10 -translate-y-1/2 place-items-center rounded-lg bg-nexora-emerald text-white" aria-label="Search">
            <Search size={16} />
          </button>
        </form>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <div className="hidden items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-nexora-ink lg:flex">
            <MapPin size={19} />
            <div className="leading-tight"><span className="block text-[10px] font-medium text-nexora-muted">Deliver to</span>Dhaka</div>
          </div>
          <Link to="/wishlist" className="relative grid h-10 w-10 place-items-center rounded-xl hover:bg-nexora-mintbg" aria-label="Wishlist">
            <Heart size={21}/>
            {wishlist.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-nexora-coral px-1 text-[9px] font-bold text-white">{wishlist.length}</span>}
          </Link>
          <Link to="/cart" className="relative grid h-10 w-10 place-items-center rounded-xl hover:bg-nexora-mintbg" aria-label="Cart">
            <ShoppingCart size={21}/>
            {cartCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#FF5E57] px-1 text-[9px] font-bold text-white">{cartCount}</span>}
          </Link>
          <Link to={accountLink} className="grid h-10 w-10 place-items-center rounded-full border border-nexora-border bg-[#F8FAF9] hover:border-nexora-emerald" aria-label="Account">
            <User size={20}/>
          </Link>
        </div>
      </div>

      <div className="border-t border-nexora-border p-3 md:hidden">
        <form onSubmit={submitSearch} className="relative">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search NEXORA..." className="h-10 w-full rounded-xl border border-nexora-border bg-[#FAFCFB] pl-11 pr-12 text-sm outline-none focus:border-nexora-emerald" />
          <button className="absolute right-1.5 top-1/2 grid h-7 w-9 -translate-y-1/2 place-items-center rounded-lg bg-nexora-emerald text-white"><Search size={14}/></button>
        </form>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="absolute inset-0 bg-nexora-ink/35" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-80 max-w-[86%] overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between"><Logo/><button onClick={() => setMenuOpen(false)}><X size={23}/></button></div>
            <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-nexora-mintbg"><LayoutGrid size={18}/> Home</Link>
            <Link to="/shops" className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-nexora-mintbg"><Store size={18}/> Shops</Link>
            <Link to="/deals" className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold text-nexora-coral hover:bg-nexora-mintbg"><Tag size={18}/> Deals</Link>
            {cats.length > 0 && <p className="mt-5 px-3 text-[11px] font-bold uppercase tracking-wider text-nexora-muted">Categories</p>}
            {cats.map((c) => <Link key={c.slug} to={`/category/${c.slug}`} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-nexora-mintbg">{c.name}</Link>)}
            <Link to="/seller/signup" className="mt-5 flex items-center justify-center rounded-xl bg-nexora-emerald px-4 py-3 text-sm font-bold text-white">Become a Seller</Link>
          </div>
        </div>
      )}
    </header>
  );
}
