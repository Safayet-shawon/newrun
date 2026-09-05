import React from 'react';
import { Link } from 'react-router-dom';
export default function BrowseMode({category='',selected}) {
  const suffix=category?`?category=${encodeURIComponent(category)}`:'';
  return <nav aria-label="Browse products or shops" className="mb-6 flex gap-2"><Link to={`/products${suffix}`} aria-current={selected==='products'?'page':undefined} className={selected==='products'?'nx-btn-primary':'nx-btn-ghost'}>Products</Link><Link to={`/shops${suffix}`} aria-current={selected==='shops'?'page':undefined} className={selected==='shops'?'nx-btn-primary':'nx-btn-ghost'}>Shops</Link></nav>;
}
