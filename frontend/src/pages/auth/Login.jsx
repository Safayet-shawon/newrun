import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Mail, Lock } from "lucide-react";
import AuthShell, { GoogleButton } from "@/pages/auth/AuthShell";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const adminLogin = location.pathname.startsWith("/admin");

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { user } = await login(form.email, form.password);
      if (user.role === "seller") navigate("/seller/dashboard");
      else if (user.role === "admin") navigate(location.state?.from || "/admin/dashboard");
      else navigate(location.state?.from || new URLSearchParams(location.search).get("next") || "/account");
    } catch (err) { setError(formatApiError(err)); } finally { setLoading(false); }
  };

  return (
    <AuthShell title={adminLogin ? "Admin sign in" : "Welcome back"} subtitle={adminLogin ? "Sign in with your NEXORA administrator account." : "Sign in to your customer account."}>
      <form onSubmit={submit} className="space-y-4" data-testid="login-form">
        {error && <div className="rounded-xl bg-[#FEECEC] px-4 py-3 text-sm text-red-600" data-testid="login-error">{error}</div>}
        <div className="relative">
          <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email address" className="h-12 w-full rounded-xl border border-nexora-border pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" data-testid="login-email" />
        </div>
        <div className="relative">
          <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input type="password" required value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password" className="h-12 w-full rounded-xl border border-nexora-border pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" data-testid="login-password" />
        </div>
        <div className="flex justify-end"><Link to="/forgot-password" className="text-sm font-medium text-nexora-emerald">Forgot password?</Link></div>
        <button disabled={loading} className="nx-btn-primary w-full" data-testid="login-submit">{loading ? "Signing in…" : "Sign in"}</button>
      </form>
      {!adminLogin && <><div className="my-5 flex items-center gap-3 text-xs text-nexora-muted"><div className="h-px flex-1 bg-nexora-border" /> OR <div className="h-px flex-1 bg-nexora-border" /></div><GoogleButton role="customer" /><p className="mt-6 text-center text-sm text-nexora-muted">New to NEXORA? <Link to="/signup" className="font-semibold text-nexora-emerald" data-testid="to-signup">Create an account</Link></p><p className="mt-2 text-center text-sm text-nexora-muted">Want to sell? <Link to="/seller/login" className="font-semibold text-nexora-ink">Seller sign in</Link></p></>}
    </AuthShell>
  );
}
