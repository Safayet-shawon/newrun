import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Search, Heart, ShoppingCart, User, Menu, X, Store, Tag, MapPin, LayoutGrid, ChevronDown } from "lucide-react";
import { Logo } from "@/components/shared/Bits";
import { useStore } from "@/context/StoreContext";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

export default function Header({ onToggleDesktopSidebar }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { cartCount, wishlist } = useStore();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [cats, setCats] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api.get("/categories").then(({ data }) => setCats(Array.isArray(data) ? data : [])).catch(() => setCats([]));
  }, []);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const submitSearch = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const openMenu = () => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches) {
      onToggleDesktopSidebar?.();
      return;
    }
    setMenuOpen(true);
  };

  const accountLink = user ? (user.role === "seller" ? "/seller/dashboard" : "/account") : "/login";

  return (
    <header className="sticky top-0 z-40 border-b border-[#E5ECE8] bg-white/95 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-3 sm:px-4 lg:px-4">
        <button onClick={openMenu} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#F1F6F4] text-[#173128] transition hover:bg-[#E9F4EF]" aria-label="Open menu">
          <Menu size={20} />
        </button>

        <Logo className="shrink-0" />

        <form onSubmit={submitSearch} className="relative mx-1 hidden min-w-0 flex-1 md:block">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7A8780]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for products, brands, or shops..."
            className="h-10 w-full rounded-xl border border-[#DDE7E1] bg-white pl-10 pr-14 text-[12px] outline-none transition focus:border-[#0A8D6C] focus:ring-2 focus:ring-[#0A8D6C]/10"
          />
          <button className="absolute right-1.5 top-1/2 grid h-8 w-10 -translate-y-1/2 place-items-center rounded-lg bg-[#0A8D6C] text-white transition hover:bg-[#08795D]" aria-label="Search">
            <Search size={15} />
          </button>
        </form>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1.5">
          <button className="hidden items-center gap-2 rounded-xl px-2 py-1.5 text-[11px] font-semibold text-[#223029] lg:flex" type="button">
            <MapPin size={18} />
            <span className="leading-tight"><span className="block text-[9px] font-medium text-[#78857E]">Deliver to</span><span className="inline-flex items-center gap-1">Dhaka <ChevronDown size={11}/></span></span>
          </button>

          <Link to="/wishlist" className="relative grid h-9 w-9 place-items-center rounded-xl text-[#1E2B25] transition hover:bg-[#ECF7F2]" aria-label="Wishlist">
            <Heart size={20}/>
            {wishlist.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#FF5E57] px-1 text-[8px] font-bold text-white">{wishlist.length}</span>}
          </Link>

          <Link to="/cart" className="relative grid h-9 w-9 place-items-center rounded-xl text-[#1E2B25] transition hover:bg-[#ECF7F2]" aria-label="Cart">
            <ShoppingCart size={20}/>
            {cartCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#FF5E57] px-1 text-[8px] font-bold text-white">{cartCount}</span>}
          </Link>

          <Link to={accountLink} className="grid h-9 w-9 place-items-center rounded-full border border-[#DCE5E0] bg-[#F8FAF9] text-[#1E2B25] transition hover:border-[#0A8D6C]" aria-label="Account">
            <User size={19}/>
          </Link>
        </div>
      </div>

      <div className="border-t border-[#E8EEEA] p-2.5 md:hidden">
        <form onSubmit={submitSearch} className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#78857E]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search NEXORA..." className="h-10 w-full rounded-xl border border-[#DDE7E1] bg-[#FAFCFB] pl-10 pr-12 text-[12px] outline-none focus:border-[#0A8D6C]" />
          <button className="absolute right-1.5 top-1/2 grid h-7 w-9 -translate-y-1/2 place-items-center rounded-lg bg-[#0A8D6C] text-white"><Search size={14}/></button>
        </form>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="absolute inset-0 bg-[#17211B]/35" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-80 max-w-[86%] overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between"><Logo showTagline/><button onClick={() => setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#F4F7F5]"><X size={22}/></button></div>
            <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-[#ECF7F2]"><LayoutGrid size={18}/> Home</Link>
            <Link to="/shops" className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-[#ECF7F2]"><Store size={18}/> Shops</Link>
            <Link to="/deals" className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold text-[#E55243] hover:bg-[#FFF2F0]"><Tag size={18}/> Deals</Link>
            {cats.length > 0 && <p className="mt-5 px-3 text-[10px] font-bold uppercase tracking-wider text-[#78857E]">Categories</p>}
            {cats.map((c) => <Link key={c.slug} to={`/category/${c.slug}`} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-[#ECF7F2]">{c.name}</Link>)}
            <Link to="/seller/signup" className="mt-5 flex items-center justify-center rounded-xl bg-[#0A8D6C] px-4 py-3 text-sm font-bold text-white">Become a Seller</Link>
          </div>
        </div>
      )}
    </header>
  );
}
