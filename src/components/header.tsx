"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

const NAV = [
  { href: "/", label: "Studio" },
  { href: "/productions", label: "Productions" },
  { href: "/conversations", label: "Conversations" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/library", label: "Library" },
  { href: "/help", label: "Help" },
  { href: "/admin", label: "Admin" },
] as const;

export function Header() {
  const pathname = usePathname();
  const [balance, setBalance] = useState<number | null>(null);
  const [account, setAccount] = useState<{ name: string; role: string; local: boolean } | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/account")
        .then((r) => r.json())
        .then((d) => { setBalance(typeof d.balance === "number" ? d.balance : null); setAccount(d.user ?? null); })
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
            CAM <span className="text-accent">Video</span>
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
          <span className="text-muted">{account.local ? "Local credits" : "Credits"}</span>
          <span className="font-mono font-medium bg-surface-2 border border-line rounded-md px-2.5 py-1">
            {balance === null ? "…" : `$${balance.toFixed(2)}`}
          </span>
          {!account.local && <button className="text-xs text-muted" onClick={() => void signOut({ callbackUrl: "/login" })}>Sign out</button>}
        </div>}
      </div>
    </header>
  );
}
