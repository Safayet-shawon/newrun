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
    {
      title: "Policies",
      links: [
        ["Privacy", "/privacy"],
        ["Marketplace Terms", "/terms"],
        ["Returns & Refunds", "/returns"],
      ],
    },
  ];

  return (
    <footer className="mt-12 border-t border-[#C7D7E8] bg-[#E7F0FA] pb-16 md:pb-0">
      <div className="border-b border-[#E8DCCB] bg-[#FFF4E8]">
        <div className="nx-container flex snap-x snap-mandatory gap-3 overflow-x-auto py-4 no-scrollbar sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-4">
          {[
            [ShieldCheck, "Secure shopping", "Protected marketplace checkout"],
            [BadgeCheck, "Verified sellers", "Clear seller identity and ratings"],
            [RotateCcw, "Returns support", "Policy-based returns on eligible orders"],
            [Truck, "Global-ready delivery", "Per-shop domestic and international rules"],
          ].map(([Icon, title, text]) => (
            <div key={title} className="flex min-w-[250px] snap-start items-center gap-3 rounded-2xl border border-[#E9DCC7] bg-white/85 px-4 py-3 shadow-sm sm:min-w-0">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EAF7F1] text-nexora-emerald"><Icon size={19} /></span>
              <span><b className="block text-sm text-[#18324A]">{title}</b><small className="text-[11px] text-[#66798B]">{text}</small></span>
            </div>
          ))}
        </div>
      </div>

      <div className="nx-container grid gap-8 py-10 sm:grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr] xl:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] md:gap-10 md:py-12">
        <div>
          <Logo showTagline />
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#5F7285]">
            A smart digital mall where products, independent shops, brands and offers are easy to discover in one trusted marketplace.
          </p>
          <div className="mt-5 flex gap-2">
            {[Facebook, Instagram, Mail].map((Icon, index) => (
              <a key={index} href="#" aria-label="Nexora social link" className="grid h-9 w-9 place-items-center rounded-full border border-[#BFD0E2] bg-white/75 text-[#587087] transition hover:border-nexora-emerald hover:bg-white hover:text-nexora-emerald"><Icon size={16} /></a>
            ))}
          </div>
          <Link to="/seller/signup" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#D8E7F7] px-4 py-3 text-sm font-bold text-[#18324A] shadow-sm transition hover:bg-white">
            <Store size={17} className="text-nexora-emerald" /> Open your shop on Nexora
          </Link>
        </div>

        {cols.map((col) => (
          <div key={col.title}>
            <h4 className="mb-4 text-sm font-extrabold text-[#18324A]">{col.title}</h4>
            <ul className="space-y-2.5">
              {col.links.map(([label, to]) => (
                <li key={label}><Link to={to} className="text-sm text-[#5F7285] transition hover:text-nexora-emeraldDark">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[#BDD0E2] bg-[#D5E4F4] py-5">
        <div className="nx-container flex flex-col gap-2 text-xs text-[#587087] sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} NEXORA. Built in Bangladesh, designed for global commerce.</span>
          <span>Products · Shops · Brands · Discovery</span>
        </div>
      </div>
    </footer>
  );
}
