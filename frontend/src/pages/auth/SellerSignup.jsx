import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User } from "lucide-react";
import AuthShell, { GoogleButton } from "@/pages/auth/AuthShell";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";

export default function SellerSignup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await register({ ...form, role: "seller" });
      navigate("/seller/onboarding");
    } catch (err) { setError(formatApiError(err)); } finally { setLoading(false); }
  };

  return (
    <AuthShell side="seller" title="Start selling on NEXORA" subtitle="Create your seller account. Next you'll set up your shop and choose a plan.">
      <form onSubmit={submit} className="space-y-4" data-testid="seller-signup-form">
        {error && <div className="rounded-xl bg-[#FEECEC] px-4 py-3 text-sm text-red-600" data-testid="seller-signup-error">{error}</div>}
        <div className="relative">
          <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Your name" className="h-12 w-full rounded-xl border border-nexora-border pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" data-testid="seller-signup-name" />
        </div>
        <div className="relative">
          <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Business email" className="h-12 w-full rounded-xl border border-nexora-border pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" data-testid="seller-signup-email" />
        </div>
        <div className="relative">
          <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input type="password" required minLength={6} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password (min 6 characters)" className="h-12 w-full rounded-xl border border-nexora-border pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" data-testid="seller-signup-password" />
        </div>
        <button disabled={loading} className="nx-btn-primary w-full" data-testid="seller-signup-submit">{loading ? "Creating…" : "Continue to onboarding"}</button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-nexora-muted"><div className="h-px flex-1 bg-nexora-border" /> OR <div className="h-px flex-1 bg-nexora-border" /></div>
      <GoogleButton role="seller" label="Sign up with Google" />
      <p className="mt-6 text-center text-sm text-nexora-muted">Already selling? <Link to="/seller/login" className="font-semibold text-nexora-emerald" data-testid="to-seller-login">Seller sign in</Link></p>
    </AuthShell>
  );
}
