"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Choose a paid plan. For a new subscriber this starts Stripe Checkout; for an
// existing subscriber it switches the current subscription's plan (no second
// subscription). Shows monthly and — when available — a highlighted yearly
// option with the saving percentage.
export function UpgradeButtons({
  plan,
  monthlyPriceEur,
  yearlyPriceEur,
  savingPct,
  subscribed = false,
}: {
  plan: "BASIC" | "PRO";
  monthlyPriceEur: number;
  yearlyPriceEur?: number | null;
  savingPct?: number | null;
  subscribed?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const hasYearly = !!yearlyPriceEur;

  async function go(interval: "monthly" | "yearly") {
    setLoading(interval);
    const endpoint = subscribed ? "/api/billing/change" : "/api/billing/checkout";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan, interval }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.url) {
      window.location.href = data.url; // new subscriber → Stripe Checkout
    } else if (res.ok) {
      router.refresh(); // existing subscriber → plan changed in place
      setLoading(null);
    } else {
      setLoading(null);
      alert(data.error ?? "Nepodarilo sa spracovať požiadavku.");
    }
  }

  const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const verb = subscribed ? "Prejsť na" : "";

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        className="w-full"
        onClick={() => go("monthly")}
        disabled={loading !== null}
      >
        {loading === "monthly"
          ? "…"
          : subscribed
            ? `${verb} mesačne · ${eur(monthlyPriceEur)}`
            : `Mesačne · ${eur(monthlyPriceEur)}`}
      </Button>
      {hasYearly && (
        <>
          <button
            type="button"
            onClick={() => go("yearly")}
            disabled={loading !== null}
            className="relative flex w-full items-center justify-center gap-2 rounded-lg border border-success/40 bg-success/5 px-3 py-2 text-sm font-medium text-success transition-colors hover:bg-success/10 disabled:opacity-50"
          >
            {loading === "yearly"
              ? "…"
              : `${subscribed ? "Prejsť na ročne" : "Ročne"} · ${eur(yearlyPriceEur! / 12)}/mes`}
            {savingPct ? (
              <span className="rounded-full bg-success px-1.5 py-0.5 text-[11px] font-bold text-white">
                −{savingPct}%
              </span>
            ) : null}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            účtované ročne
          </p>
        </>
      )}
    </div>
  );
}
