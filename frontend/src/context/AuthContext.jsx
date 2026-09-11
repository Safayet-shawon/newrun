import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiError, setAccessToken, clearAccessToken } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [sellerSetup, setSellerSetup] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyAuth = useCallback((data) => {
    setAccessToken(data.token);
    setUser(data.user);
    setSellerSetup(data.seller_setup || null);
    return data;
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const { data: session } = await api.post("/auth/refresh");
      setAccessToken(session.token);
      setUser(session.user);
      setSellerSetup(session.seller_setup || null);
    } catch (e) {
      clearAccessToken();
      setUser(null);
      setSellerSetup(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    return applyAuth(data);
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    return applyAuth(data);
  };

  const googleAuth = async (session_id, role) => {
    const { data } = await api.post("/auth/google", { session_id, role });
    return applyAuth(data);
  };

  const logout = () => {
    api.post("/auth/logout").catch(() => {});
    clearAccessToken();
    setUser(null);
    setSellerSetup(null);
  };

  const refreshMe = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setSellerSetup(data.seller_setup || null);
      return data;
    } catch (error) {
      await checkAuth();
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{ user, sellerSetup, loading, login, register, googleAuth, logout, refreshMe, setSellerSetup, formatApiError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
