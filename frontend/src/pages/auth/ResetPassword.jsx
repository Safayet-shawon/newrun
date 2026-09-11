import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import AuthShell from "@/pages/auth/AuthShell";
import { api, formatApiError } from "@/lib/api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") || "", [params]);
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!token) return setError("This reset link is missing its security token.");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      navigate("/login?reset=success", { replace: true });
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" subtitle="This will sign out older sessions for your account.">
      <form onSubmit={submit} className="space-y-4">
        {[{ label: "New password", value: password, set: setPassword }, { label: "Confirm password", value: confirm, set: setConfirm }].map((item) => (
          <div key={item.label} className="relative">
            <LockKeyhole size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-nexora-muted" />
            <input type="password" required value={item.value} onChange={(e) => item.set(e.target.value)} placeholder={item.label} className="h-12 w-full rounded-xl border border-nexora-border pl-11 pr-4 text-sm outline-none focus:border-nexora-emerald" />
          </div>
        ))}
        {error && <p role="alert" className="text-sm text-nexora-coral">{error}</p>}
        <button disabled={loading} className="nx-btn-primary w-full">{loading ? "Updating…" : "Update password"}</button>
      </form>
      <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-nexora-emerald"><ArrowLeft size={15} /> Back to sign in</Link>
    </AuthShell>
  );
}
