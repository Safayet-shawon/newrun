import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BadgeCheck, LoaderCircle } from "lucide-react";
import AuthShell from "@/pages/auth/AuthShell";
import { api, formatApiError } from "@/lib/api";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") || "", [params]);
  const [state, setState] = useState({ loading: true, ok: false, error: "" });

  useEffect(() => {
    let live = true;
    if (!token) {
      setState({ loading: false, ok: false, error: "Verification token is missing." });
      return undefined;
    }
    api.post("/auth/verification/confirm", { token })
      .then(() => { if (live) setState({ loading: false, ok: true, error: "" }); })
      .catch((err) => { if (live) setState({ loading: false, ok: false, error: formatApiError(err) }); });
    return () => { live = false; };
  }, [token]);

  return (
    <AuthShell title="Verify your email" subtitle="Email verification protects buyers, sellers and account recovery.">
      {state.loading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-nexora-border bg-white p-5 text-sm text-nexora-muted"><LoaderCircle className="animate-spin" size={18} /> Verifying your email…</div>
      ) : state.ok ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900"><div className="flex items-center gap-2 font-bold"><BadgeCheck size={18} /> Email verified</div><p className="mt-2">Your Nexora account is ready for verified actions.</p></div>
      ) : (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{state.error}</div>
      )}
      <Link to="/login" className="mt-6 inline-flex text-sm font-semibold text-nexora-emerald">Continue to sign in →</Link>
    </AuthShell>
  );
}
