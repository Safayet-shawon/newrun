import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Search, Store, Truck, ShoppingBag } from "lucide-react";
import { api } from "@/lib/api";
import HomeShell from "@/components/home/HomeShell";
import { CompactProduct, CompactShop } from "@/components/home/HomeCards";
import { discovery } from "@/content/home";
import useHomeDiscovery from "@/components/home/useHomeDiscovery";
import { BrandsRow, DiscoveryDrawer, ProductControls, ProductPagination } from "@/components/home/DiscoveryControls";
import "@/styles/home.css";
import "@/styles/home-discovery.css";
import "@/styles/home-reference.css";

export default function Home() {
  const navigate = useNavigate();
  const [data,setData] = useState(null);
  const [error,setError] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const [drawer,setDrawer] = useState(null);
  const [query,setQuery] = useState("");
  useEffect(()=>{
    const controller = new AbortController();
    setError(false);
    api.get("/home",{signal:controller.signal,timeout:8000}).then(({data})=>setData(data)).catch(e=>{if(e.code!=="ERR_CANCELED")setError(true);});
    return ()=>controller.abort();
  },[attempt]);
  const state = useHomeDiscovery({ready:!!data,isDemo:false,demoProducts:[],saved:[]});
  const browse = filters => {
    const params=new URLSearchParams();
    if(filters.category && filters.category!=="all")params.set("category",filters.category);
    if(filters.query)params.set("q",filters.query);
    if(filters.brand)params.set("brand",filters.brand);
    if(filters.collection)params.set("sort",{trending:"popular",selling:"best_selling",best:"price_low",premium:"price_high"}[filters.collection]||"popular");
    navigate(`/products?${params}`);
  };
  const brands=data?.brands||[];
  return <HomeShell navigationOpen={!!drawer} onOpenMenu={section=>setDrawer({section})} onSearch={query=>browse({query})}>
    <section className="reference-hero" aria-labelledby="home-headline"><img src="https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1600&auto=format&fit=crop&q=80" alt=""/><div><span className="home-eyebrow">ONE MARKETPLACE. MANY INDEPENDENT SHOPS.</span><h1 id="home-headline">Discover more. <em>Shop independent.</em></h1><form onSubmit={e=>{e.preventDefault();if(query.trim())browse({query:query.trim()});}}><Search size={18}/><input aria-label="Find products and brands" placeholder="Search products, brands and everyday finds…" value={query} onChange={e=>setQuery(e.target.value)}/><button>Search</button></form></div></section>
    <div className="reference-trust"><span><Store size={15}/> Independent shops</span><span><ShoppingBag size={15}/> Discover across categories</span><span><Truck size={15}/> Cash on delivery checkout</span></div>
    <section className="reference-block" aria-labelledby="category-heading"><div className="home-section-heading"><div><span className="home-eyebrow">EXPLORE BY CATEGORY</span><h2 id="category-heading">Find something you'll love</h2></div><Link to="/products">Browse all <ArrowRight size={14}/></Link></div><nav className="home-photo-discovery" aria-label="Discover categories"><div className="home-fashion-panels">{discovery.slice(0,2).map(c=><Link className="home-fashion-panel" to={`/products?category=fashion&q=${c.name.toLowerCase()}`} key={c.name}><img src={c.photo} alt={`${c.name} fashion`}/><span><small>THE EVERYDAY WARDROBE</small><strong>{c.name}</strong><em>Shop the collection <ArrowRight size={16}/></em></span></Link>)}</div><div className="home-small-categories">{discovery.slice(2).map(c=><Link className="home-photo-category" to={`/category/${c.slug||"kids"}`} key={c.name}><img src={c.photo} alt=""/><span><strong>{c.name}</strong><small>{c.detail}</small></span><ArrowRight size={14}/></Link>)}</div></nav></section>
    {error && <div className="home-data-message" role="alert">The live catalogue is unavailable. <button onClick={()=>setAttempt(n=>n+1)}>Try again</button></div>}
    <div className="reference-block reference-brands"><BrandsRow brands={brands} isDemo={false} onSelect={brand=>browse({brand})}/></div>
    <section className="reference-block" aria-labelledby="home-shops-title"><div className="home-section-heading"><div><span className="home-eyebrow">REAL PEOPLE. THEIR OWN SHOPS.</span><h2 id="home-shops-title">Independent shops on Nexora</h2></div><Link to="/shops">View all shops <ArrowRight size={14}/></Link></div><div className="home-shops">{(data?.featured_shops||[]).slice(0,4).map(shop=><CompactShop key={shop.id} shop={shop}/>)}</div>{data && !data.featured_shops?.length && <p className="home-empty">Meet the sellers building their shops. <Link to="/shops">Browse shops →</Link></p>}</section>
    <section className="reference-block reference-products" id="home-products-section" aria-labelledby="home-products-title"><div className="home-section-heading"><div><span className="home-eyebrow">CURATED DISCOVERIES</span><h2 id="home-products-title">Trending products</h2></div><Link to="/products">Full catalogue <ArrowRight size={14}/></Link></div><ProductControls state={state} categories={data?.categories||[]} isDemo={false}/>{state.error ? <p className="home-empty" role="alert">Products couldn't load. <button onClick={state.retry}>Try again</button></p> : <div className="home-products" aria-busy={state.loading}>{state.items.map(product=><CompactProduct key={product.id} product={product}/>)}</div>}{data && !state.loading && !state.items.length && <p className="home-empty">No products match these filters. <button onClick={state.reset}>Clear filters</button></p>}<ProductPagination state={state}/></section>
    <section className="reference-seller" id="about-marketplace"><span className="home-eyebrow">GROW WITH NEXORA</span><h2>Bring your shop to Nexora</h2><p>Your products. Your identity. A marketplace for independent businesses across Bangladesh.</p><Link className="home-button" to="/seller/signup">Start your shop <ArrowRight size={15}/></Link><Link to="/shops">Explore independent shops</Link></section>
    <DiscoveryDrawer request={drawer} onClose={()=>setDrawer(null)} onBrowse={browse} brands={brands}/>
  </HomeShell>;
}
