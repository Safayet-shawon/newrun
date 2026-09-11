import React from "react";

const POLICIES = {
  privacy: {
    title: "Privacy Policy",
    intro: "Nexora uses account, order, security and marketplace data to operate the service, protect users, fulfil orders and improve the marketplace.",
    sections: [
      ["Information we process", "Account details, contact and delivery information, order and payment status, seller/shop information, security logs such as login IP and device information, and marketplace activity needed to provide Nexora."],
      ["How we use it", "We use data to authenticate users, process orders, provide seller tools, prevent abuse, support customers, secure accounts and meet applicable legal obligations."],
      ["Payments", "Payment providers process payment credentials under their own policies. Nexora should store only the references and transaction data necessary to reconcile marketplace payments."],
      ["Sharing", "Data is shared only with the sellers, service providers and authorities necessary to provide an order, operate infrastructure, prevent fraud or comply with law. Nexora does not publish private account or payment information."],
      ["Security and retention", "Access controls, short-lived sessions, audit logs and network protections are used to reduce risk. Data is retained only for operational, fraud-prevention, accounting and legal needs."],
      ["Your choices", "Users may update profile and address information through their account and may contact Nexora for privacy or account requests subject to applicable law and record-retention obligations."],
    ],
  },
  terms: {
    title: "Marketplace Terms",
    intro: "These terms describe the basic rules for using Nexora as a buyer or independent seller.",
    sections: [
      ["Marketplace role", "Nexora provides marketplace technology that helps independent sellers list products and helps customers discover and order them. Seller identity, product details, fulfilment responsibilities and applicable consumer obligations remain subject to marketplace rules and local law."],
      ["Accounts", "Users must provide accurate information, protect account access and use Nexora lawfully. Nexora may restrict, suspend or ban accounts, shops or products for fraud, abuse, unsafe activity or policy violations."],
      ["Listings", "Sellers are responsible for accurate titles, images, prices, stock, variants, product authenticity, shipping information, taxes and any licences required for their goods."],
      ["Orders and pricing", "Checkout totals are validated by the server before an order is created. Stock, prices, delivery charges and availability may change until checkout is confirmed."],
      ["Payments and refunds", "Available payment and refund methods depend on country, seller and configured payment providers. Provider terms may also apply."],
      ["Prohibited activity", "Fraud, counterfeit listings, illegal goods, credential abuse, scraping that violates third-party rights, malicious activity and attempts to bypass marketplace security are prohibited."],
    ],
  },
  returns: {
    title: "Returns & Refunds",
    intro: "Return eligibility depends on the product, seller policy, delivery condition and applicable consumer law.",
    sections: [
      ["Before ordering", "Customers should review product details, variants, seller information and delivery terms before checkout."],
      ["Eligible returns", "Items that are materially different from the listing, damaged in transit, defective or otherwise returnable under applicable law or the seller policy may qualify for a return or refund."],
      ["Non-returnable items", "Certain personalised, perishable, hygiene-sensitive, digital or final-sale products may not be returnable where law permits."],
      ["Evidence and timing", "Customers may be asked to provide order details, photos or other evidence within the applicable return window so the seller and Nexora can review the request."],
      ["Refund method", "Approved refunds should be returned through the original supported payment route or another method clearly agreed with the customer, subject to payment-provider processing times."],
    ],
  },
};

export default function Legal({ type = "privacy" }) {
  const policy = POLICIES[type] || POLICIES.privacy;
  return (
    <div className="nx-container max-w-4xl py-10 sm:py-14">
      <div className="rounded-3xl border border-nexora-border bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-nexora-emerald">Nexora marketplace policy</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-nexora-ink sm:text-4xl">{policy.title}</h1>
        <p className="mt-4 text-sm leading-7 text-nexora-muted sm:text-base">{policy.intro}</p>
        <div className="mt-8 space-y-7">
          {policy.sections.map(([title, text]) => (
            <section key={title}>
              <h2 className="text-lg font-extrabold text-nexora-ink">{title}</h2>
              <p className="mt-2 text-sm leading-7 text-nexora-muted">{text}</p>
            </section>
          ))}
        </div>
        <p className="mt-9 border-t border-nexora-border pt-5 text-xs leading-6 text-nexora-muted">Last updated: September 2026. Country-specific consumer, tax and data-protection rights continue to apply where required by law.</p>
      </div>
    </div>
  );
}
