"use client";
import { useState } from "react";
import Link from "next/link";
export default function InvitationPage() {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  return <section className="max-w-md mx-auto card p-6 space-y-4"><h1 className="page-title">Set up your CAM account</h1>
    {done ? <><p>Your account is ready.</p><Link href="/login" className="btn btn-primary">Sign in</Link></> : <form onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
      try { const response = await fetch("/api/invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: window.location.hash.slice(1), name: data.get("name"), password: data.get("password") }) }); const result = await response.json();
        if (!response.ok) throw new Error(result.error); window.history.replaceState(null, "", "/accept-invitation"); setDone(true);
      } catch (error) { setError(error instanceof Error ? error.message : "Could not set up your account."); } finally { setBusy(false); }
    }}><fieldset disabled={busy} className="space-y-4"><label className="block text-sm">Your name<input name="name" required maxLength={100} autoComplete="name" className="input block mt-2" /></label>
      <label className="block text-sm">Choose a password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="input block mt-2" /><span className="text-muted">At least 12 characters.</span></label>
      <button className="btn btn-primary">{busy ? "Saving…" : "Save account"}</button></fieldset></form>}{error && <p role="alert" className="text-danger text-sm">{error}</p>}
  </section>;
}
