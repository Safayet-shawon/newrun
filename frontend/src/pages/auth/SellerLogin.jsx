import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock } from "lucide-react";
import AuthShell, { GoogleButton } from "@/pages/auth/AuthShell";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";

export default function SellerLogin() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { user, seller_setup } = await login(form.email, form.password);
      if (user.role !== "seller" && user.role !== "admin") { navigate("/account"); return; }
      navigate(seller_setup && !seller_setup.onboarding_complete ? "/seller/onboarding" : "/seller/dashboard");
    } catch (err) { setError(formatApiError(err)); } finally { setLoading(false); }
  };

  return (
    <AuthShell side="seller" title="Seller sign in" subtitle="Access your NEXORA seller dashboard.">
      <form onSubmit={submit} className="space-y-4" data-testid="seller-login-form">
        {error && <div className="rounded-xl bg-[#FEECEC] px-4 py-3 text-sm text-red-600" data-testid="seller-login-error">{error}</div>}
        <div className="relative">
          <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Business email" className="h-12 w-full rounded-xl border border-nexora-border pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" data-testid="seller-login-email" />
        </div>
        <div className="relative">
          <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input type="password" required value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password" className="h-12 w-full rounded-xl border border-nexora-border pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" data-testid="seller-login-password" />
        </div>
        <button disabled={loading} className="nx-btn-primary w-full" data-testid="seller-login-submit">{loading ? "Signing in…" : "Sign in to dashboard"}</button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-nexora-muted"><div className="h-px flex-1 bg-nexora-border" /> OR <div className="h-px flex-1 bg-nexora-border" /></div>
      <GoogleButton role="seller" label="Continue with Google" />
      <p className="mt-6 text-center text-sm text-nexora-muted">New seller? <Link to="/seller/signup" className="font-semibold text-nexora-emerald" data-testid="to-seller-signup">Start selling</Link></p>
      <p className="mt-2 text-center text-sm text-nexora-muted">Are you a shopper? <Link to="/login" className="font-semibold text-nexora-ink">Customer sign in</Link></p>
    </AuthShell>
  );
}
