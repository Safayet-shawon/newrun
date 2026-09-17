import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader } from "@/components/shared/Bits";
import { useAuth } from "@/context/AuthContext";

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { googleAuth } = useAuth();
  const processed = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const hash = location.hash || window.location.hash;
    const sessionId = new URLSearchParams(hash.replace(/^#/, "")).get("session_id");
    const ctx = new URLSearchParams(location.search || window.location.search).get("ctx") || "customer";
    if (!sessionId) { navigate("/login", { replace: true }); return; }
    (async () => {
      try {
        const { user, seller_setup } = await googleAuth(sessionId, ctx);
        window.history.replaceState({}, "", "/");
        if (user.role === "seller") navigate(seller_setup && !seller_setup.onboarding_complete ? "/seller/onboarding" : "/seller/dashboard", { replace: true });
        else navigate("/account", { replace: true });
      } catch (e) {
        setError("Google sign-in failed. Please try again.");
        setTimeout(() => navigate("/login", { replace: true }), 2000);
      }
    })();
  }, [googleAuth, location.hash, location.search, navigate]);

  return (
    <div className="min-h-screen bg-nexora-warm">
      <Loader label={error || "Finishing sign in"} />
    </div>
  );
}
