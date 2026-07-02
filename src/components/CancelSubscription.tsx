"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle, RotateCcw, AlertTriangle } from "lucide-react";

// One-click cancel / resume of the subscription, right in the app (no Stripe
// portal). Cancelling keeps the plan active until the period end, then it
// reverts to Free — nothing is charged if cancelled during the trial.
export function CancelSubscription({
  cancelAtPeriodEnd,
  endsAt,
}: {
  cancelAtPeriodEnd: boolean;
  endsAt: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(cancel: boolean) {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/billing/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cancel }),
    });
    setLoading(false);
    setConfirming(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Nepodarilo sa spracovať požiadavku.");
      return;
    }
    router.refresh();
  }

  // Already scheduled to cancel — offer to resume.
  if (cancelAtPeriodEnd) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
        <p className="flex items-start gap-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Predplatné sa <strong>zruší{endsAt ? ` ${endsAt}` : ""}</strong>. Do
            vtedy funguje normálne a nič sa už nestrhne.
          </span>
        </p>
        <button
          type="button"
          onClick={() => send(false)}
          disabled={loading}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <RotateCcw className="size-4" />
          {loading ? "Obnovujem…" : "Obnoviť predplatné"}
        </button>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      {confirming ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm">
            Naozaj zrušiť predplatné? Zostane aktívne do konca zaplateného
            obdobia{endsAt ? ` (${endsAt})` : ""}, potom sa prepne na{" "}
            <strong>Free</strong>.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => send(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
            >
              <XCircle className="size-4" />
              {loading ? "Ruším…" : "Áno, zrušiť"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={loading}
              className="rounded-lg border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Späť
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-destructive"
        >
          <XCircle className="size-4" /> Zrušiť predplatné
        </button>
      )}
    </div>
  );
}
