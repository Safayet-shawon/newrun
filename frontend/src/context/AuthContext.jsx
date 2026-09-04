import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = none, object = logged in
  const [sellerSetup, setSellerSetup] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyAuth = useCallback((data) => {
    localStorage.setItem("nexora_token", data.token);
    setUser(data.user);
    setSellerSetup(data.seller_setup || null);
    return data;
  }, []);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem("nexora_token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setSellerSetup(data.seller_setup || null);
    } catch (e) {
      localStorage.removeItem("nexora_token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return; // AuthCallback will establish the session
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
    localStorage.removeItem("nexora_token");
    setUser(null);
    setSellerSetup(null);
  };
  const refreshMe = checkAuth;

  return (
    <AuthContext.Provider value={{ user, sellerSetup, loading, login, register, googleAuth, logout, refreshMe, setSellerSetup, formatApiError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
