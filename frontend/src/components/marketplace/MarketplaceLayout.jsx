import React from "react";
import Footer from "@/components/marketplace/Footer";
import MobileBottomNav from "@/components/marketplace/MobileBottomNav";
import Header from "@/components/marketplace/Header";
import DesktopSidebar from "@/components/marketplace/DesktopSidebar";

export default function MarketplaceLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#F7FAF8] xl:flex">
      <DesktopSidebar />
      <div className="min-w-0 flex-1">
        <Header />
        <main className="pb-20 md:pb-0">{children}</main>
        <Footer />
        <MobileBottomNav />
      </div>
    </div>
  );
}
