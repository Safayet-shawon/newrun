import React from "react";
import Footer from "@/components/marketplace/Footer";
import MobileBottomNav from "@/components/marketplace/MobileBottomNav";
import Header from "@/components/marketplace/Header";

export default function MarketplaceLayout({ children }) {
  return (
    <div className="min-h-screen bg-nexora-warm text-nexora-ink">
      <Header />
      <main className="min-h-[60vh] pb-20 md:pb-0">{children}</main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
}
