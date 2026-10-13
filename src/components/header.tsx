"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Studio" },
  { href: "/productions", label: "Productions" },
  { href: "/library", label: "Library" },
  { href: "/help", label: "Help" },
  { href: "/admin", label: "Admin" },
] as const;

export function Header() {
  const pathname = usePathname();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/admin/overview")
        .then((r) => r.json())
        .then((d) => setBalance(d.balance))
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
            {NAV.map((item) => (
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
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">Credits</span>
          <span className="font-mono font-medium bg-surface-2 border border-line rounded-md px-2.5 py-1">
            {balance === null ? "…" : `$${balance.toFixed(2)}`}
          </span>
        </div>
      </div>
    </header>
  );
}
