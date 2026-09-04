import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const StoreContext = createContext(null);

const read = (k, fb) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fb;
  } catch {
    return fb;
  }
};

const cartKey = (id, variant) => id + (variant || "");

export function StoreProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState(() => read("nexora_cart", []));
  const [wishlist, setWishlist] = useState(() => read("nexora_wishlist", []));
  const [recent, setRecent] = useState(() => read("nexora_recent", []));
  const [hydrated, setHydrated] = useState(false);
  const prevUserId = useRef(user?.id);

  useEffect(() => localStorage.setItem("nexora_cart", JSON.stringify(cart)), [cart]);
  useEffect(() => localStorage.setItem("nexora_wishlist", JSON.stringify(wishlist)), [wishlist]);
  useEffect(() => localStorage.setItem("nexora_recent", JSON.stringify(recent)), [recent]);

  // Clear cart/wishlist on logout (user goes from set -> null) to avoid cross-account merge.
  useEffect(() => {
    if (prevUserId.current && !user) {
      setCart([]);
      setWishlist([]);
    }
    prevUserId.current = user?.id;
  }, [user?.id]);

  // Hydrate from server on login, merging guest (local) items with saved ones.
  useEffect(() => {
    if (!user) { setHydrated(false); return; }
    let active = true;
    (async () => {
      try {
        const [{ data: sc }, { data: sw }] = await Promise.all([api.get("/cart"), api.get("/wishlist")]);
        if (!active) return;
        setCart((prev) => {
          const map = new Map(prev.map((i) => [i.key, i]));
          (sc.items || []).forEach((si) => {
            const key = cartKey(si.product.id, si.variant);
            if (!map.has(key)) map.set(key, { key, product: si.product, qty: si.qty, variant: si.variant });
          });
          return Array.from(map.values());
        });
        setWishlist((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          const merged = [...prev];
          (sw.products || []).forEach((p) => { if (!ids.has(p.id)) merged.push(p); });
          return merged;
        });
      } catch { /* ignore */ } finally { if (active) setHydrated(true); }
    })();
    return () => { active = false; };
  }, [user?.id]);

  // Push cart to server (debounced) when authenticated.
  useEffect(() => {
    if (!user || !hydrated) return;
    const t = setTimeout(() => {
      api.post("/cart/sync", { items: cart.map((i) => ({ product_id: i.product.id, qty: i.qty, variant: i.variant })) }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [cart, user, hydrated]);

  useEffect(() => {
    if (!user || !hydrated) return;
    const t = setTimeout(() => {
      api.post("/wishlist/sync", { product_ids: wishlist.map((p) => p.id) }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [wishlist, user, hydrated]);

  const addToCart = useCallback((product, qty = 1, variant = null) => {
    setCart((prev) => {
      const key = cartKey(product.id, variant);
      const existing = prev.find((i) => i.key === key);
      if (existing) return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i));
      return [...prev, { key, product, qty, variant }];
    });
    toast.success("Added to cart", { description: product.title });
  }, []);

  const updateQty = useCallback((key, qty) => {
    setCart((prev) => prev.map((i) => (i.key === key ? { ...i, qty: Math.max(1, qty) } : i)));
  }, []);

  const removeFromCart = useCallback((key) => {
    setCart((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const toggleWishlist = useCallback((product) => {
    setWishlist((prev) => {
      if (prev.find((p) => p.id === product.id)) {
        toast("Removed from wishlist");
        return prev.filter((p) => p.id !== product.id);
      }
      toast.success("Saved to wishlist", { description: product.title });
      return [...prev, product];
    });
  }, []);

  const isWished = useCallback((id) => wishlist.some((p) => p.id === id), [wishlist]);

  const addRecent = useCallback((product) => {
    setRecent((prev) => {
      const filtered = prev.filter((p) => p.id !== product.id);
      return [product, ...filtered].slice(0, 12);
    });
  }, []);

  const cartCount = cart.reduce((n, i) => n + i.qty, 0);
  const cartTotal = cart.reduce((n, i) => n + (i.product.discount_price ?? i.product.price) * i.qty, 0);

  return (
    <StoreContext.Provider
      value={{ cart, wishlist, recent, addToCart, updateQty, removeFromCart, clearCart, toggleWishlist, isWished, addRecent, cartCount, cartTotal }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
