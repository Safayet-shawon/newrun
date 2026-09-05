import React from "react";
import { Link } from "react-router-dom";
import { Heart, Plus, Star, Store } from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { resolveImage } from "@/lib/api";
import { formatBDT, effectivePrice, discountPercent } from "@/lib/format";
import referenceImage from "@/assets/marketplace-reference.png";
import FollowShopButton from "@/components/marketplace/FollowShopButton";

export function ReferencePhoto({ crop, className = "" }) {
  if (!crop) return <span className={`home-photo-fallback ${className}`}><Store size={24} /></span>;
  return <svg aria-hidden="true" className={`home-reference-photo ${className}`} viewBox={crop.join(" ")} preserveAspectRatio="xMidYMid slice"><image href={referenceImage} width="1448" height="1086" /></svg>;
}

function Photo({ src, alt, className }) {
  const [failed, setFailed] = React.useState(false);
  return src && !failed ? <img className={className} src={resolveImage(src)} alt={alt} loading="lazy" onError={() => setFailed(true)} /> : <span className={`${className} home-photo-fallback`} role="img" aria-label={alt}><Store size={24} /></span>;
}

export function CompactProduct({ product, onPreview, onPreviewAdd, onPreviewSave, previewSaved = false }) {
  const { addToCart, toggleWishlist, isWished } = useStore();
  const discount = discountPercent(product);
  const wished = product.demo ? previewSaved : isWished(product.id);
  const Destination = product.demo ? "button" : Link;
  const destinationProps = product.demo ? { onClick: () => onPreview(product) } : { to: `/product/${product.id}` };
  const soldOut = !(product.stock > 0);
  return <article className="home-product" data-testid={`product-card-${product.id}`}>
    <div className="home-product-image">
      <Destination {...destinationProps} aria-label={`View ${product.title}`}>{product.crop ? <ReferencePhoto crop={product.crop} /> : <Photo src={product.images?.[0]} alt={product.title} />}</Destination>
      {discount > 0 && <span className="home-discount">−{discount}%</span>}
      <button className="home-save" aria-label={`Save ${product.title}`} aria-pressed={wished} onClick={() => product.demo ? onPreviewSave(product) : toggleWishlist(product)} data-testid={`wishlist-toggle-${product.id}`}><Heart size={16} fill={wished ? "currentColor" : "none"} /></button>
    </div>
    <div className="home-product-copy">
      <Destination className="home-product-title" {...destinationProps}>{product.title}</Destination>
      <div className="home-price"><span>{formatBDT(effectivePrice(product))} {discount > 0 && <del>{formatBDT(product.price)}</del>}</span><button disabled={soldOut} onClick={() => product.demo ? onPreviewAdd(product) : addToCart(product)} aria-label={`Add ${product.title} to ${product.demo ? "preview bag" : "cart"}`} data-testid={`quick-add-${product.id}`}><Plus size={16} /></button></div>
      <div className="home-meta">{product.review_count > 0 ? <><Star size={12} fill="currentColor" /> {product.rating} ({product.review_count})</> : "No reviews yet"}{soldOut && " · Sold out"}</div>
      {product.demo ? <span className="home-meta">Demo · {product.shop_name}</span> : <Link className="home-meta" to={`/shop/${product.shop_slug}`}>by {product.shop_name}</Link>}
    </div>
  </article>;
}

export function CompactShop({ shop, onPreview }) {
  const Destination = shop.demo ? "button" : Link;
  return <article className="home-shop" data-testid={`shop-card-${shop.slug}`}>
    <Destination {...(shop.demo ? { onClick: () => onPreview(shop) } : { to: `/shop/${shop.slug}` })}><Photo className="home-shop-cover" src={shop.banner || shop.logo} alt={`${shop.name} storefront preview`} /></Destination>
    <div className="home-shop-info"><span className="home-shop-label"><Store size={14} /> {shop.demo ? "DEMO SHOP" : "INDEPENDENT SHOP"}</span><h3><Destination {...(shop.demo ? { onClick: () => onPreview(shop) } : { to: `/shop/${shop.slug}` })}>{shop.name}</Destination></h3><p>{shop.tagline || shop.description || "Discover this independent shop"}</p><span className="home-meta">{shop.rating > 0 && <><Star size={11} fill="currentColor" /> {shop.rating} · </>}{shop.city || `${shop.product_count ?? 0} products`}</span></div>
    <div className="home-visit">{shop.demo ? <button onClick={()=>onPreview(shop)}>Preview shop →</button> : <><Link to={`/shop/${shop.slug}`}>Visit shop →</Link><FollowShopButton shopId={shop.id} className="home-follow-shop"/></>}</div>
  </article>;
}
