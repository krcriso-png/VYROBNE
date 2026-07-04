"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

// Admin control: block or unblock a customer's account. Blocking asks for an
// optional reason (sent to the user by e-mail). A blocked user can't log in or
// use the app at all.
export function AdminUserBlock({
  userId,
  blocked,
  email,
}: {
  userId: string;
  blocked: boolean;
  email: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(nextBlocked: boolean) {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/admin/users/${userId}/block`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blocked: nextBlocked, reason: reason.trim() || undefined }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res || !res.ok) {
      setErr(data?.error ?? "Nepodarilo sa zmeniť stav účtu.");
      return;
    }
    setOpen(false);
    setReason("");
    router.refresh();
  }

  // Unblocking is a single safe click — no reason needed to restore access.
  if (blocked) {
    return (
      <button
        type="button"
        onClick={() => submit(false)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-success/40 px-2.5 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/10 disabled:opacity-50"
      >
        <Check className="size-3.5" /> Odblokovať
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        <Ban className="size-3.5" /> Zablokovať
      </button>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-xs font-medium text-destructive">
        Zablokovať účet {email}?
      </p>
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Dôvod (pošle sa zákazníkovi e-mailom, nepovinné)"
        rows={2}
        className="text-sm"
      />
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Ban className="size-3.5" /> {busy ? "Blokujem…" : "Zablokovať"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setErr(null);
          }}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <X className="size-3.5" /> Zrušiť
        </button>
      </div>
    </div>
  );
}
