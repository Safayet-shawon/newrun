import React from "react";
import { Link } from "react-router-dom";
import { Bell, Package, Star, Rocket, CreditCard } from "lucide-react";
import { useSeller } from "@/context/SellerContext";

export default function Notifications() {
  const { shop, plan } = useSeller();
  const items = [
    { icon: Rocket, tone: "bg-nexora-mintbg text-nexora-emerald", title: `Welcome to NEXORA, ${shop?.name || "seller"}!`, body: "Your seller workspace is ready. Publish your store to start selling.", time: "Just now" },
    { icon: CreditCard, tone: "bg-[#FEF3E2] text-nexora-amber", title: `${plan?.name} plan active`, body: "Your subscription is active in test mode. Manage it anytime.", time: "Today" },
    { icon: Package, tone: "bg-[#EEF4FF] text-[#3B82F6]", title: "Add your first products", body: "Build your catalog so customers have something to browse.", time: "Today" },
    { icon: Star, tone: "bg-[#FFEDE5] text-nexora-coral", title: "Reviews build trust", body: "Encourage happy customers to leave reviews on your products.", time: "Tip" },
  ];
  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold text-nexora-ink"><Bell size={22} /> Notifications</h1>
      <div className="space-y-3">
        {items.map((n, i) => (
          <div key={i} className="flex gap-4 rounded-2xl border border-nexora-border bg-white p-4" data-testid={`notification-${i}`}>
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${n.tone}`}><n.icon size={18} /></div>
            <div className="flex-1"><div className="flex items-center justify-between"><p className="font-semibold text-nexora-ink">{n.title}</p><span className="text-xs text-nexora-muted">{n.time}</span></div><p className="mt-0.5 text-sm text-nexora-muted">{n.body}</p></div>
          </div>
        ))}
      </div>
      <Link to="/seller/dashboard/products/new" className="nx-btn-primary" data-testid="notif-add-product">Add a product</Link>
    </div>
  );
}
