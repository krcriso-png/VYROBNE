"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

// Opens the Stripe customer portal (update card, invoices, cancel plan).
export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (data.url) {
      window.location.href = data.url;
    } else {
      setLoading(false);
      alert(data.error ?? "Portál sa nepodarilo otvoriť.");
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={open} disabled={loading}>
      <Settings className="size-4" />
      {loading ? "Otváram…" : "Spravovať predplatné"}
    </Button>
  );
}
