import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const SellerContext = createContext(null);

export function SellerProvider({ children }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get("/seller/me");
      setMe(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <SellerContext.Provider value={{ me, loading, reload, ent: me?.entitlements, plan: me?.plan, shop: me?.shop, subscription: me?.subscription }}>
      {children}
    </SellerContext.Provider>
  );
}

export function useSeller() {
  return useContext(SellerContext);
}
