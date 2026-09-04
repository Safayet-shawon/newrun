import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft } from "lucide-react";
import AuthShell from "@/pages/auth/AuthShell";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (e) => { e.preventDefault(); setSent(true); };

  return (
    <AuthShell title="Reset your password" subtitle="We'll send you a link to get back into your account.">
      {sent ? (
        <div className="rounded-2xl border border-nexora-border bg-nexora-mintbg p-5 text-sm text-nexora-ink" data-testid="reset-sent">
          If an account exists for <span className="font-semibold">{email}</span>, a password reset link has been sent. Please check your inbox.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
          <div className="relative">
            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="h-12 w-full rounded-xl border border-nexora-border pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" data-testid="forgot-email" />
          </div>
          <button className="nx-btn-primary w-full" data-testid="forgot-submit">Send reset link</button>
        </form>
      )}
      <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-nexora-emerald"><ArrowLeft size={15} /> Back to sign in</Link>
    </AuthShell>
  );
}
