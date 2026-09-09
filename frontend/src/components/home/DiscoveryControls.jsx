import React, { useRef, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { discovery } from "@/content/home";
import { collections, PAGE_SIZE } from "./useHomeDiscovery";
import { useAuth } from "@/context/AuthContext";

export function scrollToProducts() { document.getElementById("home-products-section")?.scrollIntoView({ block: "start" }); }

export function ProductControls({ state, categories, isDemo }) {
  const { user } = useAuth(); const navigate = useNavigate();
  const { filters, update, total } = state;
  return <>
    <div className="home-discovery-categories" aria-label="Choose a product category">{[{slug:"all",name:"All categories"},...categories].map(c => <button key={c.slug} aria-pressed={filters.category === c.slug} onClick={() => update({ category:c.slug, query:"", saved:false })}>{c.name}</button>)}</div>
    <div className="home-collection-controls"><div aria-label="Choose a collection">{collections.map(c => <button key={c.id} aria-pressed={filters.collection === c.id} onClick={() => c.id === "following" && !user ? navigate("/login",{state:{from:"/"}}) : update({ collection:c.id })}>{c.label}</button>)}</div><span>{isDemo ? "Sample order" : collections.find(c=>c.id===filters.collection)?.detail}</span></div>
    {(filters.brand || filters.query || filters.saved) && <div className="home-active-filters"><span>{filters.brand && `Brand: ${filters.brand}`}{filters.query && ` Search: “${filters.query}”`}{filters.saved && "Saved preview items"}</span><button onClick={state.reset}>Clear filters <X size={12} /></button></div>}
    <span className="home-results-status" role="status">{state.loading ? "Loading products…" : state.error ? "Products are temporarily unavailable. Check that the backend and database are running." : `${total} ${isDemo ? "sample " : ""}product${total === 1 ? "" : "s"}`}</span>
  </>;
}

export function ProductPagination({ state }) {
  const pages = Math.max(1, Math.ceil(state.total / (state.pageSize || PAGE_SIZE)));
  if (pages <= 1 || state.loading || state.error) return null;
  return <nav className="home-pagination" aria-label="Product pages"><button disabled={state.filters.page <= 1} onClick={() => {state.update({ page:state.filters.page-1 });scrollToProducts();}}><ArrowLeft size={14} />Previous</button><span>Page {state.filters.page} of {pages}</span><button disabled={state.filters.page >= pages} onClick={() => {state.update({ page:state.filters.page+1 });scrollToProducts();}}>Next<ArrowRight size={14} /></button></nav>;
}

export function BrandsRow({ brands, isDemo, selected, onSelect }) {
  const rail = useRef(null);
  return <section className="home-brands" aria-labelledby="home-brands-heading"><div className="home-section-heading"><div><span className="home-eyebrow">DISCOVER BY NAME</span><h2 id="home-brands-heading">Brands to explore</h2></div><div className="home-brand-arrows"><button aria-label="Previous brands" onClick={() => rail.current.scrollBy({left:-320,behavior:"auto"})}><ArrowLeft size={15} /></button><button aria-label="Next brands" onClick={() => rail.current.scrollBy({left:320,behavior:"auto"})}><ArrowRight size={15} /></button></div></div>
    {isDemo && <p className="home-brand-disclaimer">Brand browsing preview. Names and sample listings are illustrative; no partnership or availability is implied.</p>}
    <div className="home-brand-rail" ref={rail}>{brands.length ? brands.map((brand,i) => <button className={`home-brand-tile brand-style-${i%4}`} key={brand} aria-pressed={selected===brand} onClick={() => onSelect(brand)}><strong>{brand}</strong><span>Explore <ArrowRight size={12} /></span></button>) : <p className="home-empty">Brands will appear as sellers add products to the catalogue.</p>}</div>
  </section>;
}

export function DiscoveryDrawer({ request, onClose, onBrowse, brands, account, inline = false }) {
  const { user } = useAuth();
  const accountRoute = account || (user?.role === "seller" ? "/seller/dashboard" : user ? "/account" : "/login");
  const ref = useRef(null);
  const [stack, setStack] = useState(["main"]);
  const current = stack[stack.length-1];
  const category = discovery.find(c=>c.name===current);
  useEffect(() => { if (request) { setStack(request.category ? ["main","categories",request.category] : request.section ? ["main",request.section] : ["main"]); if (!inline && !ref.current.open) ref.current.showModal(); } else { setStack(["main"]); if (!inline && ref.current.open) ref.current.close(); } }, [request, inline]);
  const choose = filters => {onBrowse(filters);onClose();scrollToProducts();};
  const Container = inline ? "section" : "dialog";
  return <Container ref={ref} id={inline ? "home-sidebar-navigation" : "home-navigation-drawer"} className={inline ? "home-sidebar-navigation" : "home-navigation-drawer"} aria-labelledby={inline ? "home-sidebar-title" : "home-drawer-title"} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="home-drawer-top">{stack.length>1 && <button aria-label="Back in menu" onClick={()=>setStack(s=>s.slice(0,-1))}><ArrowLeft size={19}/></button>}<h2 id={inline ? "home-sidebar-title" : "home-drawer-title"}>{current === "main" ? "Explore NEXORA" : current === "categories" ? "Shop by category" : current === "collections" ? "Discover products" : current === "brands" ? "Brands" : current === "account" ? "Welcome to NEXORA" : current}</h2>{!inline && <button aria-label="Close navigation" onClick={onClose}><X size={20}/></button>}</div><nav aria-label="Browse menu">
    {current === "main" && <><button onClick={()=>choose({category:"all",query:"",brand:""})}>Shop the marketplace<ArrowRight size={15}/></button><Link to="/account/followed-shops">Shops You Follow<ArrowRight size={15}/></Link><Link to="/account/last-purchased">Last Purchased<ArrowRight size={15}/></Link>{[["categories","Categories"],["collections","Collections"],["brands","Brands"],["account","Your account"]].map(([key,label])=><button key={key} onClick={()=>setStack(s=>[...s,key])}>{label}<ArrowRight size={15}/></button>)}<Link to="/shops">Independent shops<ArrowRight size={15}/></Link><Link to="/seller/signup">Open your shop<ArrowRight size={15}/></Link></>}
    {current === "categories" && discovery.map(c=><button key={c.name} onClick={()=>setStack(s=>[...s,c.name])}>{c.name}<ArrowRight size={15}/></button>)}
    {category && <><button onClick={()=>choose({category:category.slug||"kids",query:["Men","Women"].includes(category.name) ? category.name.toLowerCase() : "",brand:""})}>Explore {category.name}<ArrowRight size={15}/></button>{category.terms.map(term=><button key={term} onClick={()=>choose({category:category.slug||"kids",query:term,brand:""})}>{term}<ArrowRight size={15}/></button>)}</>}
    {current === "collections" && collections.map(c=><button key={c.id} onClick={()=>choose({collection:c.id})}>{c.label}<ArrowRight size={15}/></button>)}
    {current === "brands" && brands.map(b=><button key={b} onClick={()=>choose({brand:b,category:"all",query:""})}>{b}<ArrowRight size={15}/></button>)}
    {current === "account" && <><small>SHOPPING</small><Link to={accountRoute}>{user ? "My account" : "Sign in"}</Link>{!user && <Link to="/signup">Create account</Link>}<Link to="/account/followed-shops">Shops You Follow</Link><Link to="/account/last-purchased">Last Purchased</Link><Link to="/wishlist">Wishlist</Link><small>YOUR BUSINESS</small><Link to="/seller/login">Seller sign in</Link><Link to="/seller/signup">Open your shop</Link></>}
  </nav><p>Independent shops. Shared possibilities.</p></Container>;
}
