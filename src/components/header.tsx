"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { toCredits } from "@/lib/credits-display";

const NAV = [
  { href: "/", label: "Create video" },
  { href: "/productions", label: "My videos" },
  { href: "/credits", label: "My credits" },
  { href: "/help", label: "Help" },
  { href: "/admin", label: "Admin" },
] as const;

export function Header() {
  const pathname = usePathname();
  const [balance, setBalance] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);

  const [localDemo, setLocalDemo] = useState(false);
  const [account, setAccount] = useState<{ name: string; role: string; local: boolean } | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/account")
        .then((r) => r.json())
        .then((d) => { setBalance(typeof d.balance === "number" ? d.balance : null); setAccount(d.user ?? null); setPreview(d.preview === true); setLocalDemo(d.localDemo === true); })
        .catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  // UI pass of 2026-10-25: the navigation is a segmented control (grey rail, white pill on the active item),
  // the balance a blue pill, and the primary action sits on the right.
  return (
    <header className="border-b border-line bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-3 min-h-14 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 sm:gap-6 flex-wrap min-w-0">
          <Link href="/" className="font-semibold tracking-tight shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/recipes/cam-clay/logo.png" alt="CAM · Combat Antisemitism Movement" className="w-32 h-14 object-contain" />
          </Link>
          <nav aria-label="Main navigation" className="seg">
            {NAV.filter((item) => item.href !== "/admin" || account?.role === "admin").map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={pathname === item.href ? "on" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        {account && <div className="flex items-center gap-3 text-sm flex-wrap">
          {preview ? <span className="pill">{localDemo ? "Local demo · No charges" : "Preview workspace · No charges"}</span> : <span className="pill" aria-label="CAM credits balance"><span aria-hidden="true">◎</span><span className="font-mono">{balance === null ? "…" : toCredits(balance).toLocaleString("en-US")}</span> CAM credits</span>}
          <Link href="/?new=1" className="btn btn-primary btn-sm">+ Create video</Link>
          {!account.local && <button className="btn btn-ghost btn-sm" onClick={() => void signOut({ callbackUrl: "/login" })}>Sign out</button>}
        </div>}
      </div>
    </header>
  );
}
