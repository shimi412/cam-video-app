"use client";

import { useCallback, useEffect, useState } from "react";

type Overview = {
  balance: number;
  ledger: Array<{ id: string; deltaUsd: number; kind: string; note: string | null; createdAt: string }>;
  apiCalls: Array<{ id: string; provider: string; kind: string; model: string; realCostUsd: number; billedUsd: number; createdAt: string }>;
  jobs: Array<{ id: string; status: string; script: string; estimateUsd: number | null; billedUsd: number | null; createdAt: string }>;
  settings: Record<string, unknown>;
};

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [topup, setTopup] = useState("50");
  const [margin, setMargin] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/overview")
      .then((r) => r.json())
      .then((d: Overview) => {
        setData(d);
        setMargin((current) => current || String(d.settings.margin_multiplier ?? 2.5));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  async function doTopup() {
    await fetch("/api/admin/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountUsd: Number(topup) }),
    });
    load();
  }

  async function saveMargin() {
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "margin_multiplier", value: Number(margin) }),
    });
    load();
  }

  if (!data) return <p className="text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between"><h1 className="text-2xl font-semibold tracking-tight">Admin</h1><a href="/admin/users" className="text-accent">Manage workspace access</a></div>

      <div className="grid grid-cols-3 gap-4">
        <section className="bg-surface border border-line rounded-xl p-5">
          <h2 className="text-sm text-muted">Credit balance</h2>
          <p className="text-3xl font-mono font-semibold mt-2">${data.balance.toFixed(2)}</p>
          <div className="flex gap-2 mt-4">
            <input
              value={topup}
              onChange={(e) => setTopup(e.target.value)}
              type="number"
              className="w-24 bg-surface-2 border border-line rounded-md px-2 py-1.5 text-sm font-mono"
            />
            <button
              onClick={doTopup}
              className="bg-accent hover:bg-accent/90 text-white rounded-md px-4 py-1.5 text-sm"
            >
              Top up
            </button>
          </div>
          <p className="text-xs text-muted mt-2">Manual in local dev. Stripe at delivery.</p>
        </section>

        <section className="bg-surface border border-line rounded-xl p-5">
          <h2 className="text-sm text-muted">Margin multiplier</h2>
          <p className="text-3xl font-mono font-semibold mt-2">×{String(data.settings.margin_multiplier ?? 2.5)}</p>
          <div className="flex gap-2 mt-4">
            <input
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              type="number"
              step="0.1"
              className="w-24 bg-surface-2 border border-line rounded-md px-2 py-1.5 text-sm font-mono"
            />
            <button
              onClick={saveMargin}
              className="bg-surface-2 border border-line hover:border-accent rounded-md px-4 py-1.5 text-sm"
            >
              Save
            </button>
          </div>
          <p className="text-xs text-muted mt-2">Real cost × margin = client price.</p>
        </section>

        <section className="bg-surface border border-line rounded-xl p-5">
          <h2 className="text-sm text-muted">Chat model</h2>
          <p className="text-lg font-mono mt-2">{String(data.settings.chat_model ?? "claude-sonnet-5")}</p>
          <p className="text-xs text-muted mt-2">
            Admin-side only, never exposed to the client. Wired to the live chat in the next
            build phase.
          </p>
        </section>
      </div>

      <section className="bg-surface border border-line rounded-xl p-5">
        <h2 className="font-medium mb-3">Productions</h2>
        <table className="w-full text-sm">
          <thead className="text-muted text-left">
            <tr>
              <th className="py-1.5 font-normal">Script</th>
              <th className="font-normal">Status</th>
              <th className="font-normal text-right">Estimate</th>
              <th className="font-normal text-right">Billed</th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.map((j) => (
              <tr key={j.id} className="border-t border-line">
                <td className="py-2 text-muted max-w-md truncate">{j.script}</td>
                <td className="capitalize">{j.status}</td>
                <td className="text-right font-mono">{j.estimateUsd ? `$${j.estimateUsd.toFixed(2)}` : "—"}</td>
                <td className="text-right font-mono">{j.billedUsd ? `$${j.billedUsd.toFixed(2)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-2 gap-4">
        <section className="bg-surface border border-line rounded-xl p-5">
          <h2 className="font-medium mb-3">Credit ledger</h2>
          <ul className="space-y-1.5 text-sm max-h-72 overflow-y-auto">
            {data.ledger.map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span className="text-muted truncate">{l.note ?? l.kind}</span>
                <span className={`font-mono ${l.deltaUsd >= 0 ? "text-success" : "text-danger"}`}>
                  {l.deltaUsd >= 0 ? "+" : ""}
                  {l.deltaUsd.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-surface border border-line rounded-xl p-5">
          <h2 className="font-medium mb-3">API call metering</h2>
          <ul className="space-y-1.5 text-sm max-h-72 overflow-y-auto">
            {data.apiCalls.map((c) => (
              <li key={c.id} className="flex justify-between gap-3">
                <span className="text-muted truncate">
                  {c.provider}/{c.model}
                </span>
                <span className="font-mono whitespace-nowrap">
                  {c.realCostUsd.toFixed(3)} → ${c.billedUsd.toFixed(3)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
