"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

async function post(cancel: boolean): Promise<boolean> {
  const res = await fetch("/api/billing/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cancel }),
  });
  return res.ok;
}

// "Prejsť na Free" — cancels the paid subscription at period end (reverts to
// Free). Two-step confirm so it isn't triggered by accident.
export function DowngradeToFree({ endsAt }: { endsAt: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const ok = await post(true);
    setLoading(false);
    setConfirming(false);
    if (ok) router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded-lg border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
      >
        Prejsť na Free
      </button>
    );
  }

  return (
    <div className="space-y-2 text-center">
      <p className="text-xs text-muted-foreground">
        Predplatné zostane aktívne do{endsAt ? ` ${endsAt}` : " konca obdobia"},
        potom sa prepne na Free.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="flex-1 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
        >
          {loading ? "Ruším…" : "Potvrdiť"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="flex-1 rounded-lg border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Späť
        </button>
      </div>
    </div>
  );
}

// "Obnoviť predplatné" — undo a scheduled cancellation.
export function ResumeSubscription() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const ok = await post(false);
    setLoading(false);
    if (ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={loading}
      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      <RotateCcw className="size-4" />
      {loading ? "Obnovujem…" : "Obnoviť predplatné"}
    </button>
  );
}
