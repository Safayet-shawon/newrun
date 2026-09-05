import React, { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Store, Package, Check, X, Plus, Minus, ShieldCheck, Truck, Ticket } from "lucide-react";
import { ReferencePhoto } from "./HomeCards";
import { formatBDT } from "@/lib/format";

function PreviewPhoto({ product, className = "" }) { return product.crop ? <ReferencePhoto crop={product.crop} className={className}/> : <img className={className} src={product.images?.[0]} alt={product.title} style={{objectFit:"cover"}}/>; }

const steps = [
  { label: "Create your shop", title: "A space that feels like you.", copy: "Create your seller account, tell your story, and give your shop a name. Your storefront brings your products together in one place.", points: ["Set up your shop profile", "Choose your category", "Add your logo and story"], preview: "Your shop, your identity", Icon: Store },
  { label: "Add your products", title: "Let the details do the talking.", copy: "Upload clear photos, write useful descriptions, and set your prices and stock. Save drafts while you get everything ready.", points: ["Add photos and product details", "Set price, options and stock", "Review before publishing"], preview: "A thoughtful product listing", Icon: Package },
  { label: "Publish & manage", title: "Open your doors to discovery.", copy: "Publish your shop and eligible products for customers to discover. Use your dashboard to review orders and keep your catalogue up to date.", points: ["Publish your storefront", "Keep your inventory current", "Review incoming orders"], preview: "Your everyday shop dashboard", Icon: Check },
];

export function ShoppingServices({ isDemo, onBrowse }) {
  const [offerOpen, setOfferOpen] = useState(false);
  return <section className="home-shopping-services" aria-label="Shopping services and offers">
    <div className="home-trust-cards">
      <article><ShieldCheck/><div><h3>Know what you're buying</h3><p>Explore seller details, product descriptions and available reviews.</p></div></article>
      <article><Truck/><div><h3>Cash on delivery</h3><p>Available in the current checkout. Review your order details before placing it.</p></div></article>
      <article><Store/><div><h3>Meet the independent shops</h3><p>Discover each seller's storefront and browse their catalogue.</p></div></article>
    </div>
    <div className="home-offer-cards">
      <article><span className="home-eyebrow">A GOOD PLACE TO START</span><h3>Find your best buys.</h3><p>Browse products from lower to higher prices and discover what fits your budget.</p><button className="home-button" onClick={()=>onBrowse({collection:"best"})}>Explore best buys <ArrowRight size={16}/></button></article>
      <article><Ticket/><span className="home-eyebrow">{isDemo ? "DEMO OFFER PREVIEW" : "COUPONS & OFFERS"}</span><h3>A little extra for your next find.</h3><p>{isDemo ? "See a sample coupon presentation. No discount will be applied." : "There are no verified homepage coupon offers available right now."}</p>{isDemo && <button className="home-offer-link" aria-expanded={offerOpen} onClick={()=>setOfferOpen(!offerOpen)}>{offerOpen ? "Hide sample offer" : "View sample offer"} <ArrowRight size={16}/></button>}{isDemo && offerOpen && <div className="home-sample-coupon" role="status"><strong>DEMO10 · Illustrative 10% offer</strong><span>Design preview only. This code is not valid at checkout.</span></div>}</article>
    </div>
  </section>;
}

export function MarketplaceStory() {
  const [step, setStep] = useState(0);
  const active = steps[step];
  const Icon = active.Icon;
  return <>
    <section className="home-about" id="about-marketplace"><span className="home-eyebrow">ABOUT NEXORA</span><h2>Independent shops.<br />Everyday possibilities.</h2><div><p>A marketplace connecting shoppers with independent businesses across Bangladesh. Explore their products, discover their stories, and find something for your everyday.</p><Link to="/shops">Meet the shops <ArrowRight size={15} /></Link></div></section>
    <section className="home-how" aria-labelledby="seller-steps-heading"><div className="home-section-heading"><div><span className="home-eyebrow">FOR INDEPENDENT BUSINESSES</span><h2 id="seller-steps-heading">Your shop starts here.</h2></div><Link to="/seller/login">Seller sign in <ArrowRight size={14} /></Link></div>
      <div className="home-step-tabs" role="tablist" aria-label="How to start selling">{steps.map((s, i) => <button key={s.label} id={`seller-step-${i}`} role="tab" aria-selected={i === step} aria-controls="seller-step-panel" tabIndex={i === step ? 0 : -1} onClick={() => setStep(i)} onKeyDown={e => { let next; if (e.key === "ArrowRight") next = (i + 1) % steps.length; if (e.key === "ArrowLeft") next = (i + steps.length - 1) % steps.length; if (e.key === "Home") next = 0; if (e.key === "End") next = steps.length - 1; if (next !== undefined) { e.preventDefault(); setStep(next); document.getElementById(`seller-step-${next}`).focus(); } }}><span>0{i + 1}</span>{s.label}</button>)}</div>
      <div className="home-step-panel" id="seller-step-panel" role="tabpanel" aria-labelledby={`seller-step-${step}`} tabIndex={0}>
        <div className="home-step-copy"><h3>{active.title}</h3><p>{active.copy}</p><ul>{active.points.map(p => <li key={p}><Check size={14} />{p}</li>)}</ul><Link className="home-button" to="/seller/signup">Open your shop <ArrowRight size={15} /></Link></div>
        <div className={`home-step-art step-${step}`} aria-label={`${active.preview}, illustrative interface`}><div className="home-preview-window"><div className="home-preview-top"><span /><span /><span /><small>YOUR NEXORA SHOP</small></div><div className="home-preview-body"><Icon size={30} /><strong>{active.preview}</strong>{step === 0 ? <><div className="home-preview-cover" /><p>A name. A story. A place to begin.</p></> : step === 1 ? <div className="home-preview-products">{[[285,833,160,93],[1244,833,178,93],[1046,833,178,93]].map(c => <ReferencePhoto key={c[0]} crop={c} />)}</div> : <div className="home-preview-orders">{["Product catalogue", "Inventory", "Orders"].map(p => <div key={p}>{p}<Check size={14} /></div>)}</div>}<small>Illustrative dashboard preview</small></div></div><div className="home-floating-note"><Check size={15} />{active.points[0]}</div></div>
      </div>
    </section>
  </>;
}

export function DemoDialog({ selection, onClose, bag, onAdd, onRemove, products, onSelect }) {
  const ref = useRef(null);
  useEffect(() => { if (selection && !ref.current.open) ref.current.showModal(); else if (!selection && ref.current.open) ref.current.close(); }, [selection]);
  return <dialog ref={ref} className="home-demo-dialog" aria-labelledby="demo-dialog-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="home-demo-dialog-top"><span className="home-eyebrow">ILLUSTRATIVE PREVIEW</span><button aria-label="Close preview" onClick={onClose}><X size={20} /></button></div><h2 id="demo-dialog-title">{selection?.title || selection?.name || "Your preview bag"}</h2>
    <p className="home-demo-disclaimer">Demo content only. Nothing here can be purchased, and no real cart or account is changed.</p>
    {selection?.id && !selection?.slug && <><PreviewPhoto product={selection} className="home-demo-detail-image" /><p>{selection.description}</p><strong>{formatBDT(selection.price)} · illustrative price</strong><button className="home-button" onClick={() => onAdd(selection)}>Add to preview bag <Plus size={14} /></button></>}
    {selection?.slug && <><p>{selection.description}</p><div className="home-demo-shop-items">{products.filter(p => p.shop_name === selection.name).map(p => <button key={p.id} onClick={() => onSelect(p)}><PreviewPhoto product={p} /><span>{p.title}<strong>{formatBDT(p.price)}</strong></span><ArrowRight size={16} /></button>)}</div></>}
    {selection?.bag && <><div className="home-demo-shop-items">{bag.length ? bag.map(p => <div key={p.id}><PreviewPhoto product={p} /><span>{p.title}<strong>{p.qty} × {formatBDT(p.price)}</strong></span><button aria-label={`Remove one ${p.title}`} onClick={() => onRemove(p)}><Minus size={17} /></button></div>) : <p>Your preview bag is empty. Explore the sample products and add a favourite.</p>}</div>{bag.length > 0 && <strong>Preview subtotal: {formatBDT(bag.reduce((n,p) => n + p.price * p.qty,0))}</strong>}</>}
    <button className="home-demo-back" onClick={onClose}>Continue exploring</button>
  </dialog>;
}

