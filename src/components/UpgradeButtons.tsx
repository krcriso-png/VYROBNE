"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Choose a paid plan. For a NEW subscriber this starts Stripe Checkout (Stripe
// shows its own confirmation + amount). For an EXISTING subscriber it switches
// the current subscription's plan — but only after an explicit in-app
// confirmation that shows the price and how it will be billed.
export function UpgradeButtons({
  plan,
  planName,
  monthlyPriceEur,
  yearlyPriceEur,
  savingPct,
  subscribed = false,
  trialing = false,
  nextChargeDate = null,
}: {
  plan: "BASIC" | "PRO";
  planName: string;
  monthlyPriceEur: number;
  yearlyPriceEur?: number | null;
  savingPct?: number | null;
  subscribed?: boolean;
  trialing?: boolean;
  nextChargeDate?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [pending, setPending] = useState<"monthly" | "yearly" | null>(null);
  const hasYearly = !!yearlyPriceEur;
  const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

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
      setPending(null);
      router.refresh(); // existing subscriber → plan changed in place
      setLoading(null);
    } else {
      setLoading(null);
      setPending(null);
      alert(data.error ?? "Nepodarilo sa spracovať požiadavku.");
    }
  }

  // Clicking a plan: new subscriber → straight to Stripe; existing → confirm.
  function choose(interval: "monthly" | "yearly") {
    if (subscribed) setPending(interval);
    else go(interval);
  }

  // In-app confirmation for a plan CHANGE (existing subscriber).
  if (pending) {
    const price = pending === "yearly" ? eur(yearlyPriceEur! / 12) : eur(monthlyPriceEur);
    const per = pending === "yearly" ? "/mes (účtované ročne)" : "/mes";
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <p className="text-sm">
          Prejsť na <strong>{planName}</strong> za{" "}
          <strong>
            {price}
            {per}
          </strong>
          ?
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {trialing
            ? `Počas skúšobnej lehoty sa nič nestrhne. Od ${nextChargeDate ?? "konca skúšky"} sa účtuje nová cena.`
            : `Rozdiel ceny do ${nextChargeDate ?? "konca obdobia"} sa zúčtuje alikvotne, ďalej platíš novú cenu.`}
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={() => go(pending)}
            disabled={loading !== null}
          >
            {loading ? "Mením…" : "Potvrdiť zmenu"}
          </Button>
          <button
            type="button"
            onClick={() => setPending(null)}
            disabled={loading !== null}
            className="rounded-lg border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Späť
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        className="w-full"
        onClick={() => choose("monthly")}
        disabled={loading !== null}
      >
        {loading === "monthly"
          ? "…"
          : subscribed
            ? `Prejsť na mesačne · ${eur(monthlyPriceEur)}`
            : `Mesačne · ${eur(monthlyPriceEur)}`}
      </Button>
      {hasYearly && (
        <>
          <button
            type="button"
            onClick={() => choose("yearly")}
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
