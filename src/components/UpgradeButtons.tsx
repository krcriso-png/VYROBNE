"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Starts a Stripe Checkout session and redirects the user to pay. Shows the
// monthly price, and — when a yearly price exists — a highlighted yearly option
// with the saving percentage.
export function UpgradeButtons({
  plan,
  monthlyPriceEur,
  yearlyPriceEur,
  savingPct,
}: {
  plan: "BASIC" | "PRO";
  monthlyPriceEur: number;
  yearlyPriceEur?: number | null;
  savingPct?: number | null;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const hasYearly = !!yearlyPriceEur;

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

  const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        className="w-full"
        onClick={() => checkout("monthly")}
        disabled={loading !== null}
      >
        {loading === "monthly" ? "…" : `Mesačne · ${eur(monthlyPriceEur)}`}
      </Button>
      {hasYearly && (
        <button
          type="button"
          onClick={() => checkout("yearly")}
          disabled={loading !== null}
          className="relative flex w-full items-center justify-center gap-2 rounded-lg border border-success/40 bg-success/5 px-3 py-2 text-sm font-medium text-success transition-colors hover:bg-success/10 disabled:opacity-50"
        >
          {loading === "yearly"
            ? "…"
            : `Ročne · ${eur(yearlyPriceEur!)}`}
          {savingPct ? (
            <span className="rounded-full bg-success px-1.5 py-0.5 text-[11px] font-bold text-white">
              −{savingPct}%
            </span>
          ) : null}
        </button>
      )}
    </div>
  );
}
