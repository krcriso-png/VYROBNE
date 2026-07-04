"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

// Admin (moderation) control: remove a customer's listing. A reason is required
// and is e-mailed to the owner; the ad is also taken down from the portals.
export function AdminListingRemove({
  listingId,
  title,
}: {
  listingId: string;
  title: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (reason.trim().length < 3) {
      setErr("Napíš dôvod odstránenia (zákazník ho dostane e-mailom).");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/admin/listings/${listingId}/remove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res || !res.ok) {
      setErr(data?.error ?? "Nepodarilo sa odstrániť inzerát.");
      return;
    }
    setOpen(false);
    setReason("");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        <Trash2 className="size-3.5" /> Odstrániť
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-xs font-medium text-destructive">
        Odstrániť inzerát „{title}"? Stiahne sa aj z portálov a zákazník dostane
        e-mail s dôvodom.
      </p>
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Dôvod odstránenia (napr. porušenie pravidiel, zakázaný obsah…)"
        rows={2}
        className="text-sm"
      />
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Trash2 className="size-3.5" /> {busy ? "Odstraňujem…" : "Odstrániť"}
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
