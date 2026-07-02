"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

// Admin control: pause a portal for customers (hidden from them, still usable
// by admins) or resume it. Shown per portal in the admin panel.
export function AdminPortalToggle({
  portalKey,
  name,
  integration,
  enabled,
  paused,
}: {
  portalKey: string;
  name: string;
  integration: string;
  enabled: boolean;
  paused: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(paused);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !value;
    setValue(next);
    setBusy(true);
    const res = await fetch("/api/admin/portals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: portalKey, pausedForUsers: next }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      setValue(!next); // revert on failure
      return;
    }
    router.refresh();
  }

  return (
    <div
      className={
        "flex items-center justify-between gap-3 rounded-lg border p-3 " +
        (value ? "border-warning/40 bg-warning/5" : "border-input")
      }
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {name}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {integration}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {!enabled
            ? "Vypnutý úplne"
            : value
              ? "Pozastavený pre zákazníkov (funguje len adminovi)"
              : "Aktívny pre všetkých"}
        </p>
      </div>
      {enabled && (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={
            "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 " +
            (value
              ? "border-success/40 text-success hover:bg-success/10"
              : "border-warning/40 text-warning hover:bg-warning/10")
          }
        >
          {value ? (
            <>
              <Eye className="size-3.5" /> Zapnúť pre zákazníkov
            </>
          ) : (
            <>
              <EyeOff className="size-3.5" /> Pozastaviť pre zákazníkov
            </>
          )}
        </button>
      )}
    </div>
  );
}
