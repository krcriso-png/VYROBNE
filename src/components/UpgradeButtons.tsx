"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Starts a Stripe Checkout session and redirects the user to pay. The yearly
// button only appears when a yearly price is configured for the plan.
export function UpgradeButtons({
  plan,
  hasYearly = false,
}: {
  plan: "BASIC" | "PRO";
  hasYearly?: boolean;
}) {
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
      <Button
        size="sm"
        className="w-full"
        onClick={() => checkout("monthly")}
        disabled={loading !== null}
      >
        {loading === "monthly" ? "…" : "Mesačne"}
      </Button>
      {hasYearly && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => checkout("yearly")}
          disabled={loading !== null}
        >
          {loading === "yearly" ? "…" : "Ročne (zľava)"}
        </Button>
      )}
    </div>
  );
}
