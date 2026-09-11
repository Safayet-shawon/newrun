import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User } from "lucide-react";
import AuthShell, { GoogleButton } from "@/pages/auth/AuthShell";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await register({ ...form, role: "customer" });
      navigate("/account");
    } catch (err) { setError(formatApiError(err)); } finally { setLoading(false); }
  };

  return (
    <AuthShell title="Create your account" subtitle="Join NEXORA and start shopping in minutes.">
      <form onSubmit={submit} className="space-y-4" data-testid="signup-form">
        {error && <div className="rounded-xl bg-[#FEECEC] px-4 py-3 text-sm text-red-600" data-testid="signup-error">{error}</div>}
        <div className="relative">
          <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" className="h-12 w-full rounded-xl border border-nexora-border pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" data-testid="signup-name" />
        </div>
        <div className="relative">
          <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email address" className="h-12 w-full rounded-xl border border-nexora-border pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" data-testid="signup-email" />
        </div>
        <div className="relative">
          <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
          <input type="password" required minLength={8} maxLength={128} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password (min 8 characters)" className="h-12 w-full rounded-xl border border-nexora-border pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" data-testid="signup-password" />
        </div>
        <button disabled={loading} className="nx-btn-primary w-full" data-testid="signup-submit">{loading ? "Creating…" : "Create account"}</button>
      </form>
      <p className="mt-3 text-xs leading-5 text-nexora-muted">We may ask you to verify your email before protected checkout actions.</p>
      <div className="my-5 flex items-center gap-3 text-xs text-nexora-muted"><div className="h-px flex-1 bg-nexora-border" /> OR <div className="h-px flex-1 bg-nexora-border" /></div>
      <GoogleButton role="customer" label="Sign up with Google" />
      <p className="mt-6 text-center text-sm text-nexora-muted">Already have an account? <Link to="/login" className="font-semibold text-nexora-emerald" data-testid="to-login">Sign in</Link></p>
    </AuthShell>
  );
}
