import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader } from "@/components/shared/Bits";

export function RequireAuth({ children, role }) {
  const { user, loading, sellerSetup } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen bg-nexora-warm"><Loader label="Checking your session" /></div>;
  if (!user) {
    const to = role === "seller" ? "/seller/login" : role === "admin" ? "/admin/login" : "/login";
    return <Navigate to={to} state={{ from: location.pathname }} replace />;
  }
  if (role && user.role !== role && user.role !== "admin") {
    return <Navigate to={user.role === "seller" ? "/seller/dashboard" : "/account"} replace />;
  }
  // Force seller onboarding completion
  if (role === "seller" && sellerSetup && !sellerSetup.onboarding_complete && location.pathname !== "/seller/onboarding") {
    return <Navigate to="/seller/onboarding" replace />;
  }
  return children;
}
