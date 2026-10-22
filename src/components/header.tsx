"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

const NAV = [
  { href: "/", label: "Create video" },
  { href: "/productions", label: "My videos" },
  { href: "/library", label: "Library" },
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

  return (
    <header className="border-b border-line bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-3 min-h-14 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 sm:gap-8 flex-wrap">
          <Link href="/" className="font-semibold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/recipes/cam-clay/logo.png" alt="CAM · Combat Antisemitism Movement" className="w-32 h-14 object-contain" />
          </Link>
          <nav aria-label="Main navigation" className="flex gap-1 flex-wrap">
            {NAV.filter((item) => item.href !== "/admin" || account?.role === "admin").map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  pathname === item.href
                    ? "bg-accent-soft text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        {account && <div className="flex items-center gap-3 text-sm">
          {preview ? <span className="text-xs bg-accent-soft border border-line rounded-md px-3 py-1.5">{localDemo ? "Local demo · No charges" : "Preview workspace · No charges"}</span> : <><span className="text-muted">CAM credits</span><span className="font-mono font-medium bg-surface-2 border border-line rounded-md px-2.5 py-1">
            {balance === null ? "…" : balance.toFixed(2)}
          </span></>}
          {!account.local && <button className="text-xs text-muted" onClick={() => void signOut({ callbackUrl: "/login" })}>Sign out</button>}
        </div>}
      </div>
    </header>
  );
}
