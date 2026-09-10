import React, { useEffect, useMemo, useState } from "react";
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
  Bookmark,
  Package,
  UsersRound,
  ShieldCheck,
  RotateCcw,
  Truck,
  ArrowRight,
} from "lucide-react";
import { Logo } from "@/components/shared/Bits";
import { useStore } from "@/context/StoreContext";
import { useAuth } from "@/context/AuthContext";
import { api, resolveImage } from "@/lib/api";
import { effectivePrice, formatBDT } from "@/lib/format";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cartCount, wishlist } = useStore();
  const { user, logout } = useAuth();
  const [q, setQ] = useState("");
  const [menuQ, setMenuQ] = useState("");
  const [cats, setCats] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMode, setSearchMode] = useState("all");
  const [suggestions, setSuggestions] = useState({ products: [], shops: [] });
  const [suggestLoading, setSuggestLoading] = useState(false);

  useEffect(() => {
    api.get("/categories").then(({ data }) => setCats(data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    const value = q.trim();
    if (value.length < 2) {
      setSuggestions({ products: [], shops: [] });
      setSuggestLoading(false);
      return undefined;
    }
    setSuggestLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      Promise.allSettled([
        api.get("/products", { signal: controller.signal, params: { search: value, limit: 8 } }),
        api.get("/shops", { signal: controller.signal, params: { search: value, limit: 5 } }),
      ]).then(([productsResult, shopsResult]) => {
        setSuggestions({
          products: productsResult.status === "fulfilled" ? (productsResult.value.data?.items || []) : [],
          shops: shopsResult.status === "fulfilled" ? (shopsResult.value.data || []) : [],
        });
      }).finally(() => setSuggestLoading(false));
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const submitSearch = (event) => {
    event.preventDefault();
    const value = q.trim();
    if (!value) return;
    if (searchMode === "shops") navigate(`/shops?q=${encodeURIComponent(value)}`);
    else if (searchMode === "brands") navigate(`/products?brand=${encodeURIComponent(value)}`);
    else navigate(`/search?q=${encodeURIComponent(value)}`);
  };

  const accountLink = user
    ? user.role === "seller"
      ? "/seller/dashboard"
      : "/account"
    : "/login";

  const customerLink = (path) => user && user.role === "customer" ? path : "/login";

  const menuLinks = [
    { label: "Home", to: "/", icon: Home },
    { label: "Categories", to: "/products", icon: LayoutGrid },
    { label: "Shops", to: "/shops", icon: Store },
    { label: "Collections", to: "/products?sort=popular", icon: Bookmark },
    { label: "Deals", to: "/deals", icon: Tag, accent: true },
    { label: "Wishlist", to: "/wishlist", icon: Heart },
    { label: "Orders", to: customerLink("/account/orders"), icon: Package },
    { label: "Following", to: customerLink("/account/followed-shops"), icon: UsersRound },
    { label: "Account", to: accountLink, icon: User },
  ];

  const filteredCats = useMemo(() => {
    const needle = menuQ.trim().toLowerCase();
    if (!needle) return cats;
    return cats.filter((cat) => `${cat.name} ${cat.slug}`.toLowerCase().includes(needle));
  }, [cats, menuQ]);

  const matchingCategories = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    return cats.filter((cat) => `${cat.name} ${cat.slug}`.toLowerCase().includes(needle)).slice(0, 4);
  }, [cats, q]);

  const matchingBrands = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = suggestions.products.map((p) => p.brand).filter(Boolean);
    return [...new Set(all)].filter((name) => name.toLowerCase().includes(needle) || needle.includes(name.toLowerCase())).slice(0, 5);
  }, [suggestions.products, q]);

  const matchingProductShops = useMemo(() => {
    const map = new Map();
    suggestions.products.forEach((product) => {
      if (!product.shop_slug || !product.shop_name) return;
      const existing = map.get(product.shop_slug) || { slug: product.shop_slug, name: product.shop_name, matching_count: 0, image: product.images?.[0] };
      existing.matching_count += 1;
      if (!existing.image && product.images?.[0]) existing.image = product.images[0];
      map.set(product.shop_slug, existing);
    });
    suggestions.shops.forEach((shop) => {
      if (!shop?.slug || map.has(shop.slug)) return;
      map.set(shop.slug, { ...shop, matching_count: 0 });
    });
    return [...map.values()].slice(0, 6);
  }, [suggestions]);

  const SearchDropdown = () => {
    if (!searchOpen || q.trim().length < 2) return null;
    const products = suggestions.products.slice(0, 5);
    return (
      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[90] overflow-hidden rounded-2xl border border-[#D6E3ED] bg-white shadow-2xl">
        <div className="flex gap-1 overflow-x-auto border-b border-[#E5EDF3] bg-[#F7FAFC] p-2 no-scrollbar">
          {[['all','All'],['products','Products'],['shops','Shops'],['brands','Brands']].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setSearchMode(key)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${searchMode === key ? "bg-nexora-emerald text-white" : "bg-white text-nexora-muted hover:bg-[#E8F1FB]"}`}>{label}</button>
          ))}
        </div>
        <div className="max-h-[430px] overflow-y-auto p-3">
          {suggestLoading && <p className="px-2 py-4 text-sm text-nexora-muted">Searching Nexora…</p>}

          {!suggestLoading && (searchMode === "all" || searchMode === "products") && products.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between px-1"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-nexora-muted">Products</p><Link to={`/search?q=${encodeURIComponent(q.trim())}`} className="text-[10px] font-bold text-nexora-emerald">See all</Link></div>
              <div className="space-y-1">
                {products.map((product) => (
                  <Link key={product.id} to={`/product/${product.id}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-[#F2F8F5]">
                    <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[#EEF4F8]"><img src={resolveImage(product.images?.[0])} alt="" className="h-full w-full object-cover" /></span>
                    <span className="min-w-0 flex-1"><b className="block truncate text-sm text-nexora-ink">{product.title}</b><small className="block truncate text-[11px] text-nexora-muted">{product.shop_name} · {formatBDT(effectivePrice(product))}</small></span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {!suggestLoading && (searchMode === "all" || searchMode === "shops") && matchingProductShops.length > 0 && (
            <div className={searchMode === "all" && products.length ? "mt-4 border-t border-[#E5EDF3] pt-3" : ""}>
              <div className="mb-2 flex items-center justify-between px-1"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-nexora-muted">Shops with matching items</p><Link to={`/shops?q=${encodeURIComponent(q.trim())}`} className="text-[10px] font-bold text-nexora-emerald">See shops</Link></div>
              <div className="grid gap-1 sm:grid-cols-2">
                {matchingProductShops.map((shop) => (
                  <Link key={shop.slug} to={`/shop/${shop.slug}`} className="flex items-center gap-2 rounded-xl p-2 transition hover:bg-[#EAF2FB]">
                    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-nexora-emerald text-xs font-extrabold text-white">{shop.image ? <img src={resolveImage(shop.image)} alt="" className="h-full w-full object-cover" /> : shop.name?.[0]}</span>
                    <span className="min-w-0"><b className="block truncate text-xs text-nexora-ink">{shop.name}</b><small className="text-[10px] text-nexora-muted">{shop.matching_count ? `${shop.matching_count} matching result${shop.matching_count > 1 ? "s" : ""}` : "Matching shop"}</small></span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {!suggestLoading && (searchMode === "all" || searchMode === "brands") && matchingBrands.length > 0 && (
            <div className="mt-4 border-t border-[#E5EDF3] pt-3"><p className="mb-2 px-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-nexora-muted">Brands</p><div className="flex flex-wrap gap-2">{matchingBrands.map((brand) => <Link key={brand} to={`/products?brand=${encodeURIComponent(brand)}`} className="rounded-full bg-[#EAF2FB] px-3 py-1.5 text-xs font-bold text-[#315C89] hover:bg-[#DCEAF7]">{brand}</Link>)}</div></div>
          )}

          {!suggestLoading && searchMode === "all" && matchingCategories.length > 0 && (
            <div className="mt-4 border-t border-[#E5EDF3] pt-3"><p className="mb-2 px-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-nexora-muted">Categories</p><div className="flex flex-wrap gap-2">{matchingCategories.map((cat) => <Link key={cat.slug} to={`/category/${cat.slug}`} className="rounded-full bg-[#E8F6EF] px-3 py-1.5 text-xs font-bold text-nexora-emeraldDark">{cat.name}</Link>)}</div></div>
          )}

          {!suggestLoading && !products.length && !matchingProductShops.length && !matchingBrands.length && !matchingCategories.length && <div className="px-2 py-7 text-center"><Search className="mx-auto text-[#9CB1C4]" size={22} /><p className="mt-2 text-sm font-semibold text-nexora-ink">No instant matches yet</p><button type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(q.trim())}`)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-nexora-emerald">Search the full marketplace <ArrowRight size={13} /></button></div>}
        </div>
      </div>
    );
  };

  return (
    <header className="sticky top-0 z-50 border-b border-nexora-border bg-white/95 backdrop-blur-xl">
      <div className="hidden border-b border-[#DDF3E9] bg-nexora-mintbg/80 sm:block">
        <div className="nx-container flex h-8 items-center justify-between text-[11px] font-medium text-nexora-muted">
          <div className="flex items-center gap-4"><span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-nexora-emerald" /> Secure shopping</span><span className="inline-flex items-center gap-1.5"><Store size={13} className="text-nexora-emerald" /> Verified sellers</span><span className="inline-flex items-center gap-1.5"><RotateCcw size={13} className="text-nexora-emerald" /> Easy returns</span></div>
          <div className="flex items-center gap-4"><span className="inline-flex items-center gap-1.5"><MapPin size={13} /> Deliver to <b className="text-nexora-ink">Dhaka</b></span><span>Bangladesh · EN</span></div>
        </div>
      </div>

      <div className="nx-container flex h-[68px] items-center gap-3 lg:gap-4">
        <button onClick={() => setMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-nexora-border bg-white text-nexora-ink transition hover:border-nexora-emerald hover:bg-nexora-mintbg hover:text-nexora-emerald" aria-label="Open menu" data-testid="marketplace-menu-open"><Menu size={21} /></button>
        <Logo className="shrink-0" showTagline />

        <div className="relative hidden min-w-0 flex-1 md:block">
          <form onSubmit={submitSearch} className="relative" data-testid="search-form">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
            <input value={q} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQ(event.target.value); setSearchOpen(true); }} placeholder="Search products, shops or brands..." className="h-11 w-full rounded-xl border border-nexora-border bg-[#FBFDFC] pl-11 pr-14 text-sm text-nexora-ink outline-none transition focus:border-nexora-emerald focus:bg-white focus:ring-2 focus:ring-nexora-emerald/10" data-testid="search-input" />
            <button type="submit" className="absolute right-1.5 top-1/2 grid h-8 w-10 -translate-y-1/2 place-items-center rounded-lg bg-nexora-emerald text-white transition hover:bg-nexora-emeraldDark" aria-label="Search"><Search size={16} /></button>
          </form>
          <SearchDropdown />
        </div>

        <nav className="hidden shrink-0 items-center gap-1 xl:flex"><Link to="/shops" className="flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-nexora-ink hover:bg-nexora-mintbg"><Store size={17} /> Shops</Link><Link to="/products" className="flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-nexora-ink hover:bg-nexora-mintbg"><LayoutGrid size={17} /> Categories</Link><Link to="/deals" className="relative flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-nexora-ink hover:bg-[#FFF5EF]"><Tag size={17} /> Deals<span className="absolute -right-1 -top-0.5 rounded-full bg-nexora-coral px-1.5 py-0.5 text-[8px] font-black text-white">HOT</span></Link></nav>

        <div className="ml-auto flex items-center gap-0.5">
          <Link to="/wishlist" className="relative grid h-10 w-10 place-items-center rounded-full text-nexora-ink transition hover:bg-nexora-mintbg" aria-label="Wishlist"><Heart size={20} />{wishlist.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-nexora-coral px-1 text-[10px] font-bold text-white">{wishlist.length}</span>}</Link>
          <Link to="/cart" className="relative grid h-10 w-10 place-items-center rounded-full text-nexora-ink transition hover:bg-nexora-mintbg" aria-label="Cart"><ShoppingBag size={20} />{cartCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-nexora-emerald px-1 text-[10px] font-bold text-white">{cartCount}</span>}</Link>
          <Link to={accountLink} className="ml-1 flex h-10 items-center gap-2 rounded-full border border-nexora-border bg-white px-2.5 text-xs font-semibold text-nexora-ink transition hover:border-nexora-emerald hover:bg-nexora-mintbg" aria-label="Account">{user ? <span className="grid h-6 w-6 place-items-center rounded-full bg-nexora-emerald text-[10px] font-bold text-white">{user.name?.[0]?.toUpperCase() || "N"}</span> : <User size={17} />}<span className="hidden 2xl:inline">{user ? "Account" : "Sign in"}</span></Link>
        </div>
      </div>

      <div className="border-t border-nexora-border px-4 py-2 md:hidden">
        <div className="relative">
          <form onSubmit={submitSearch} className="relative"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" /><input value={q} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQ(event.target.value); setSearchOpen(true); }} placeholder="Search products, shops or brands..." className="h-10 w-full rounded-xl border border-nexora-border bg-[#FBFDFC] pl-10 pr-11 text-sm outline-none focus:border-nexora-emerald" /><button type="submit" className="absolute right-1.5 top-1/2 grid h-7 w-8 -translate-y-1/2 place-items-center rounded-lg bg-nexora-emerald text-white" aria-label="Search"><Search size={14} /></button></form>
          <SearchDropdown />
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-[100]">
          <button className="absolute inset-0 h-full w-full bg-nexora-ink/30 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
          <aside className="absolute left-0 top-0 h-[100dvh] w-[310px] max-w-[90vw] overflow-y-auto border-r border-nexora-border bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3"><Logo showTagline /><button onClick={() => setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-full text-nexora-muted hover:bg-nexora-mintbg hover:text-nexora-ink" aria-label="Close menu"><X size={20} /></button></div>
            <div className="relative mt-2"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-nexora-muted" /><input value={menuQ} onChange={(e) => setMenuQ(e.target.value)} placeholder="Search menu or category..." className="h-10 w-full rounded-xl border border-nexora-border bg-[#FBFDFC] pl-10 pr-3 text-sm outline-none focus:border-nexora-emerald" /></div>
            <nav className="mt-4 space-y-1">{menuLinks.map(({ label, to, icon: Icon, accent }) => <Link key={label} to={to} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${location.pathname === to ? "bg-nexora-mintbg text-nexora-emeraldDark" : accent ? "text-nexora-coral hover:bg-[#FFF4EE]" : "text-nexora-ink hover:bg-nexora-mintbg"}`}><Icon size={18} /> {label}</Link>)}</nav>
            <div className="mt-5 border-t border-nexora-border pt-4"><div className="mb-2 flex items-center justify-between px-2"><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-nexora-muted">Shop by category</p><Link to="/products" className="text-[10px] font-bold text-nexora-emerald">See all</Link></div><div className="grid grid-cols-2 gap-1">{filteredCats.slice(0, 12).map((category) => <Link key={category.slug} to={`/category/${category.slug}`} className="rounded-xl px-3 py-2 text-sm font-medium text-nexora-ink transition hover:bg-nexora-mintbg hover:text-nexora-emeraldDark">{category.name}</Link>)}</div></div>
            <div className="mt-5 rounded-2xl border border-[#CDEFE2] bg-nexora-mintbg p-4"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-nexora-emerald shadow-sm"><Store size={20} /></div><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-nexora-emeraldDark">Sell on Nexora</p><h3 className="mt-1 text-lg font-extrabold text-nexora-ink">Reach more customers</h3><p className="mt-1 text-xs leading-5 text-nexora-muted">Build your own storefront inside Bangladesh&apos;s digital marketplace.</p></div></div><Link to="/seller/signup" className="mt-4 flex h-10 items-center justify-center rounded-xl bg-nexora-emerald text-sm font-bold text-white transition hover:bg-nexora-emeraldDark">Become a seller</Link></div>
            <div className="mt-5 grid gap-2 text-xs text-nexora-muted"><span className="flex items-center gap-2"><ShieldCheck size={15} className="text-nexora-emerald" /> Trusted marketplace</span><span className="flex items-center gap-2"><Truck size={15} className="text-nexora-emerald" /> Nationwide delivery</span><span className="flex items-center gap-2"><RotateCcw size={15} className="text-nexora-emerald" /> Easy returns on eligible items</span></div>
            {user && <button onClick={() => { logout(); navigate("/"); setMenuOpen(false); }} className="mt-5 flex w-full items-center gap-3 rounded-xl border border-nexora-border px-3 py-2.5 text-sm font-semibold text-nexora-coral hover:bg-[#FFF4EE]"><LogOut size={18} /> Log out</button>}
          </aside>
        </div>
      )}
    </header>
  );
}
