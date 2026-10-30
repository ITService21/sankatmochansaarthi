import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../shared/auth/AuthContext";
import { LoadingState } from "../../../shared/components";

/**
 * Landing page of the social sign-in redirect: `/oauth/callback#token=<jwt>`.
 * The token travels in the URL fragment (never sent to servers or logs); it is stored, then the fragment is dropped
 * from history and the user is sent to their home page.
 */
export function OAuthCallbackPage() {
  const { loginWithToken } = useAuth();
  const nav = useNavigate();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; // React StrictMode runs effects twice in development
    ran.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token) { nav("/login?error=PROVIDER_ERROR", { replace: true }); return; }
    loginWithToken(token).then(
      (u) => nav(u.role === "Administrator" ? "/admin/materials" : "/study-materials", { replace: true }),
      () => nav("/login?error=PROVIDER_ERROR", { replace: true }),
    );
  }, [loginWithToken, nav]);
  return <div className="flex min-h-screen items-center justify-center"><LoadingState message="Signing you in…" /></div>;
}
