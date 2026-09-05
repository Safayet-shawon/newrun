import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Heart, ShoppingCart, User, Menu, MapPin } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useStore } from "@/context/StoreContext";

export function HomeBrand() { return <Link to="/" className="home-brand" aria-label="NEXORA home"><span className="home-symbol" aria-hidden="true" />NEXORA</Link>; }
export default function HomeShell({ children, onSearch, isDemo, onOpenMenu, navigationOpen }) {
  const [query, setQuery] = useState("");
  const [showHeaderSearch,setShowHeaderSearch] = useState(false);
  useEffect(()=>{
    const hero=document.querySelector('.reference-hero');
    if(!hero)return;
    const observer=new IntersectionObserver(([entry])=>setShowHeaderSearch(!entry.isIntersecting && entry.boundingClientRect.bottom<=0));
    observer.observe(hero);
    return ()=>observer.disconnect();
  },[]);
  const { user, logout } = useAuth();
  const { cartCount } = useStore();
  const navigate = useNavigate();
  const account = user?.role === "seller" ? "/seller/dashboard" : user ? "/account" : "/login";
  return <div className="compact-home reference-home">
    <div className="home-main-shell">
      <header className={`home-header ${showHeaderSearch ? "show-header-search" : "hero-visible"}`}>
        <button className="home-menu-button" aria-label="Open navigation menu" aria-expanded={navigationOpen} aria-haspopup="dialog" aria-controls="home-navigation-drawer" onClick={() => onOpenMenu()}><Menu size={23} /></button><HomeBrand />
        <form className="home-search" role="search" onSubmit={e => { e.preventDefault(); if (query.trim()) { if (onSearch) onSearch(query.trim()); else navigate(`/search?q=${encodeURIComponent(query.trim())}`); } }}><Search size={16} /><input aria-label="Search products, brands or shops" placeholder={isDemo ? "Explore demo products and shops…" : "Search for products, brands, or shops…"} value={query} onChange={e => setQuery(e.target.value)} /><button aria-label="Search"><Search size={18} /></button></form>
        <span className="home-location"><MapPin size={21} /><span>Made for<strong>Bangladesh</strong></span></span>
        <Link className="home-header-icon" to="/wishlist" aria-label="Wishlist"><Heart /></Link><Link className="home-header-icon" to="/cart" aria-label={`Cart, ${cartCount} items`}><ShoppingCart />{cartCount > 0 && <span>{cartCount}</span>}</Link><details className="home-account-menu" onKeyDown={e => { if (e.key === "Escape") { e.currentTarget.open = false; e.currentTarget.querySelector("summary").focus(); } }}><summary aria-label="Account and seller sign in"><User size={22} /></summary><div><strong>Welcome to NEXORA</strong>{user ? <><Link to={account}>My account</Link><button onClick={logout}>Sign out</button></> : <><small>FOR YOUR EVERYDAY DISCOVERIES</small><Link to="/login">Sign in</Link><Link to="/signup">Create account</Link></>}<small>FOR INDEPENDENT BUSINESSES</small><Link to="/seller/login">Seller sign in</Link><Link to="/seller/signup">Open your shop →</Link></div></details>
      </header>
      <main id="home-content" className="home-content">{children}</main>
      <footer className="home-footer"><div><HomeBrand /><p>Independent shops.<br />Everyday discoveries across Bangladesh.</p></div><div><strong>Explore</strong><Link to="/products">Shop the marketplace</Link><Link to="/shops">Independent shops</Link><a href="#about-marketplace">About NEXORA</a></div><div><strong>Your account</strong><Link to="/login">Sign in</Link><Link to="/signup">Create account</Link><Link to="/wishlist">Wishlist</Link></div><div><strong>Build your business</strong><Link to="/seller/signup">Open your shop</Link><Link to="/seller/login">Seller sign in</Link></div><small>© {new Date().getFullYear()} NEXORA · Independent shops. Shared possibilities.</small></footer>
    </div>
  </div>;
}



