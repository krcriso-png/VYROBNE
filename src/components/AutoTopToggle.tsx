"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

// Compact toggle to turn on/off automatic "topovať" every 24 h straight from
// the dashboard overview. Persists via PATCH /api/listings/:id.
export function AutoTopToggle({
  listingId,
  initialOn,
}: {
  listingId: string;
  initialOn: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initialOn);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    const next = !on;
    // Make the cost explicit before turning it ON.
    if (
      next &&
      !window.confirm(
        "Automatické topovanie každých 24 h. Každé topovanie stojí 1 kredit za každý portál, na ktorom je inzerát zverejnený. Zapnúť?",
      )
    ) {
      return;
    }
    setBusy(true);
    setOn(next); // optimistic
    const res = await fetch(`/api/listings/${listingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ renewIntervalHours: next ? 24 : null }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      setOn(!next); // revert on failure
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title="Automaticky topovať každých 24 h · 1 kredit za portál pri každom topovaní"
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
        on
          ? "bg-success/12 text-success hover:bg-success/20"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      <Timer className="size-3.5" />
      {on ? "Topovanie 24 h: zap." : "Topovať každých 24 h"}
    </button>
  );
}
