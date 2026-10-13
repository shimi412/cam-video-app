"use client";
import { useEffect, useState, useCallback } from "react";
type User = { id: string; name: string; email: string; role: string; disabled: boolean };
export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false), [url, setUrl] = useState(""), [copied, setCopied] = useState(false);
  const load = useCallback(async () => { const response = await fetch("/api/admin/users"); const result = await response.json(); if (!response.ok) throw new Error(result.error); setUsers(result.users); }, []);
  useEffect(() => { const timer = setTimeout(() => void load().catch(() => setError("Could not load users.")), 0); return () => clearTimeout(timer); }, [load]);
  return <section className="space-y-6"><h1 className="text-2xl font-semibold">Workspace access</h1><p className="text-muted">Invited CAM users share productions. Administrators also manage accounts and internal settings.</p>
    <form className="border border-line rounded-xl p-5 space-y-3" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); setUrl(""); setCopied(false); const data = new FormData(event.currentTarget);
      try { const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), role: data.get("role") }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setUrl(result.url); }
      catch (error) { setError(error instanceof Error ? error.message : "Could not prepare invitation."); } finally { setBusy(false); }
    }}><h2 className="font-medium">Invite a user or reset their password</h2><fieldset disabled={busy} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Email<input name="email" type="email" required className="block p-2 rounded bg-surface-2 border border-line" /></label>
      <label className="text-sm">Role<select name="role" className="block p-2 rounded bg-surface-2 border border-line"><option value="client">CAM client</option><option value="admin">Bina administrator</option></select></label>
      <button className="bg-accent rounded text-white px-4 py-2">Prepare invitation</button></fieldset><p className="text-xs text-muted">Valid for 48 hours, usable once. Existing accounts keep their role. No email is sent automatically.</p></form>
    {url && <div className="border border-line rounded p-4"><p>Invitation ready. Share its link privately with the intended recipient.</p><button className="text-accent mt-2" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setError("Clipboard unavailable. Use a browser with clipboard access."); } }}>{copied ? "Copied" : "Copy invitation link"}</button></div>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    <ul className="space-y-3">{users.map((user) => <li key={user.id} className="border border-line rounded-xl p-4 flex justify-between gap-4"><div><p>{user.name}</p><p className="text-sm text-muted">{user.email} · {user.role} · {user.disabled ? "Disabled" : "Active"}</p></div><button disabled={busy} className="text-accent" onClick={async () => { setBusy(true); setError(""); try { const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: user.id, disabled: !user.disabled }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await load(); } catch (error) { setError(error instanceof Error ? error.message : "Could not update user."); } finally { setBusy(false); } }}>{user.disabled ? "Enable" : "Disable"}</button></li>)}</ul>
  </section>;
}
