"use client";

import { useState } from "react";

// Starts a Stripe Checkout session and redirects the user to pay.
export function UpgradeButtons({ plan }: { plan: "BASIC" | "PRO" }) {
  const [loading, setLoading] = useState<string | null>(null);

  async function checkout(interval: "monthly" | "yearly") {
    setLoading(interval);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan, interval }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.url) {
      window.location.href = data.url;
    } else {
      setLoading(null);
      alert(data.error ?? "Nepodarilo sa spustiť platbu.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => checkout("monthly")}
        disabled={loading !== null}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {loading === "monthly" ? "…" : "Mesačne"}
      </button>
      <button
        onClick={() => checkout("yearly")}
        disabled={loading !== null}
        className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {loading === "yearly" ? "…" : "Ročne"}
      </button>
    </div>
  );
}
