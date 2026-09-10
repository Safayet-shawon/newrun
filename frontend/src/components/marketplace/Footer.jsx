import React from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/shared/Bits";
import {
  Facebook,
  Instagram,
  Mail,
  ShieldCheck,
  RotateCcw,
  Truck,
  BadgeCheck,
  Store,
} from "lucide-react";

export default function Footer() {
  const cols = [
    {
      title: "Explore",
      links: [
        ["All Products", "/products"],
        ["Independent Shops", "/shops"],
        ["Categories", "/products"],
        ["Deals", "/deals"],
        ["Top Rated", "/products?sort=rating"],
        ["New Arrivals", "/products?sort=newest"],
      ],
    },
    {
      title: "Your Nexora",
      links: [
        ["Sign in", "/login"],
        ["Create account", "/signup"],
        ["Orders", "/account/orders"],
        ["Wishlist", "/wishlist"],
        ["Shops You Follow", "/account/followed-shops"],
      ],
    },
    {
      title: "Sell",
      links: [
        ["Become a Seller", "/seller/signup"],
        ["Seller Login", "/seller/login"],
        ["Seller Dashboard", "/seller/dashboard"],
      ],
    },
  ];

  return (
    <footer className="mt-14 border-t border-[#CFE8DD] bg-[#EAF7F1]">
      <div className="border-b border-[#D8E9E1] bg-[#FFF7E8]">
        <div className="nx-container grid gap-3 py-5 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [ShieldCheck, "Secure shopping", "Protected marketplace checkout"],
            [BadgeCheck, "Verified sellers", "Clear seller identity and ratings"],
            [RotateCcw, "Easy returns", "Simple return flow on eligible orders"],
            [Truck, "Nationwide delivery", "Built for shopping across Bangladesh"],
          ].map(([Icon, title, text]) => (
            <div key={title} className="flex items-center gap-3 rounded-2xl border border-[#F0E2C7] bg-white/80 px-4 py-3 shadow-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EAF7F1] text-nexora-emerald"><Icon size={19} /></span>
              <span><b className="block text-sm text-nexora-ink">{title}</b><small className="text-[11px] text-nexora-muted">{text}</small></span>
            </div>
          ))}
        </div>
      </div>

      <div className="nx-container grid gap-10 py-12 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo showTagline />
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#5D756A]">
            A smart digital mall where products, independent shops, brands and offers are easy to discover in one trusted marketplace.
          </p>
          <div className="mt-5 flex gap-2">
            {[Facebook, Instagram, Mail].map((Icon, index) => (
              <a key={index} href="#" aria-label="Nexora social link" className="grid h-9 w-9 place-items-center rounded-full border border-[#C8DFD4] bg-white/70 text-[#5D756A] transition hover:border-nexora-emerald hover:bg-white hover:text-nexora-emerald"><Icon size={16} /></a>
            ))}
          </div>
          <Link to="/seller/signup" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white/85 px-4 py-3 text-sm font-bold text-nexora-emeraldDark shadow-sm transition hover:bg-white">
            <Store size={17} /> Open your shop on Nexora
          </Link>
        </div>

        {cols.map((col) => (
          <div key={col.title}>
            <h4 className="mb-4 text-sm font-extrabold text-nexora-ink">{col.title}</h4>
            <ul className="space-y-2.5">
              {col.links.map(([label, to]) => (
                <li key={label}><Link to={to} className="text-sm text-[#5D756A] transition hover:text-nexora-emeraldDark">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[#CFE8DD] bg-[#DFF2E9] py-5">
        <div className="nx-container flex flex-col gap-2 text-xs text-[#5D756A] sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} NEXORA. Built for Bangladesh.</span>
          <span>Products · Shops · Brands · Discovery</span>
        </div>
      </div>
    </footer>
  );
}
