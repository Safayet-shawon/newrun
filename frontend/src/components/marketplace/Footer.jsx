import React from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/shared/Bits";
import { Facebook, Instagram, Twitter, Mail } from "lucide-react";

export default function Footer() {
  const cols = [
    { title: "Marketplace", links: [["All Products", "/products"], ["Shops", "/shops"], ["Deals", "/deals"], ["Categories", "/products"]] },
    { title: "Sell", links: [["Sell on NEXORA", "/seller/signup"], ["Seller Login", "/seller/login"], ["Pricing Plans", "/seller/signup"]] },
    { title: "Account", links: [["Sign in", "/login"], ["Create account", "/signup"], ["My Orders", "/account/orders"], ["Wishlist", "/wishlist"]] },
  ];
  return (
    <footer className="mt-16 border-t border-nexora-border bg-white">
      <div className="nx-container grid grid-cols-2 gap-8 py-12 md:grid-cols-5">
        <div className="col-span-2">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-nexora-muted">Bangladesh's premium multi-vendor marketplace. Discover thousands of products from independent shops you can trust.</p>
          <div className="mt-4 flex gap-2">
            {[Facebook, Instagram, Twitter, Mail].map((Ic, i) => (
              <a key={i} href="#" className="grid h-9 w-9 place-items-center rounded-full border border-nexora-border text-nexora-muted hover:border-nexora-emerald hover:text-nexora-emerald"><Ic size={16} /></a>
            ))}
          </div>
        </div>
        {cols.map((col) => (
          <div key={col.title}>
            <h4 className="mb-3 text-sm font-bold text-nexora-ink">{col.title}</h4>
            <ul className="space-y-2">
              {col.links.map(([label, to]) => (
                <li key={label}><Link to={to} className="text-sm text-nexora-muted hover:text-nexora-emerald">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-nexora-border py-5">
        <div className="nx-container flex flex-col items-center justify-between gap-2 text-xs text-nexora-muted sm:flex-row">
          <span>© {new Date().getFullYear()} NEXORA. Made in Bangladesh.</span>
          <span>Premium marketplace foundation • Emerald &amp; Mint</span>
        </div>
      </div>
    </footer>
  );
}
