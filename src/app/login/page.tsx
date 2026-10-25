"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { safeReturn } from "@/lib/auth-policy";
export default function LoginPage() {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  return <section className="max-w-md mx-auto card p-6 space-y-5"><h1 className="page-title">Sign in to CAM</h1><p className="text-sm text-muted">Use your invited workspace account.</p>
    <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
      try { const result = await signIn("credentials", { email: data.get("email"), password: data.get("password"), redirect: false });
        if (result?.error) setError("Sign-in failed. Check your details or try again in 15 minutes.");
        else window.location.assign(safeReturn(new URLSearchParams(window.location.search).get("next")));
      } catch { setError("Sign-in is unavailable. Please try again."); } finally { setBusy(false); }
    }}><fieldset disabled={busy} className="space-y-4"><label className="block text-sm">Email<input name="email" type="email" autoComplete="username" required className="input block mt-2" /></label>
      <label className="block text-sm">Password<input name="password" type="password" autoComplete="current-password" minLength={12} maxLength={128} required className="input block mt-2" /></label>
      <button className="btn btn-primary">{busy ? "Signing in…" : "Sign in"}</button></fieldset></form>
    {error && <p role="alert" className="text-danger text-sm">{error}</p>}<p className="text-xs text-muted">Need access or a password reset? Ask your workspace administrator for a new invitation.</p>
  </section>;
}
