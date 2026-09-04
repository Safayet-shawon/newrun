export function formatBDT(amount) {
  if (amount == null) return "৳0";
  return "৳" + Number(amount).toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

export function effectivePrice(product) {
  return product?.discount_price != null ? product.discount_price : product?.price;
}

export function discountPercent(product) {
  if (product?.discount_price == null || !product?.price) return 0;
  return Math.round(((product.price - product.discount_price) / product.price) * 100);
}

export function stockState(product) {
  const s = product?.stock ?? 0;
  if (s <= 0) return { label: "Out of stock", tone: "out" };
  if (s <= 5) return { label: `Only ${s} left`, tone: "low" };
  return { label: "In stock", tone: "in" };
}

export function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}
