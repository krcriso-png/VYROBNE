"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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
      <Button
        size="sm"
        className="w-full"
        onClick={() => checkout("monthly")}
        disabled={loading !== null}
      >
        {loading === "monthly" ? "…" : "Mesačne"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => checkout("yearly")}
        disabled={loading !== null}
      >
        {loading === "yearly" ? "…" : "Ročne (zľava)"}
      </Button>
    </div>
  );
}
