"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PortalOption {
  key: string;
  name: string;
  hasAccount: boolean;
}

interface PublicationState {
  portalKey: string;
  status: string;
  remoteUrl: string | null;
}

const STATUS_ICON: Record<string, string> = {
  PUBLISHED: "🟢",
  PENDING: "🟡",
  PUBLISHING: "🟡",
  UPDATING: "🟡",
  ERROR: "🔴",
  REMOVED: "⚪",
};

// Client panel for a listing: upload photos and publish to selected portals.
export function PublishPanel({
  listingId,
  portals,
  publications,
}: {
  listingId: string;
  portals: PortalOption[];
  publications: PublicationState[];
}) {
  const router = useRouter();
  const pubByPortal = new Map(publications.map((p) => [p.portalKey, p]));
  const [selected, setSelected] = useState<Set<string>>(
    new Set(publications.map((p) => p.portalKey)),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const res = await fetch(`/api/listings/${listingId}/images`, {
      method: "POST",
      body: fd,
    });
    setBusy(false);
    setMessage(res.ok ? "Fotky nahraté." : "Nahrávanie zlyhalo.");
    router.refresh();
  }

  async function publish() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/listings/${listingId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ portalKeys: Array.from(selected) }),
    });
    setBusy(false);
    if (res.ok) {
      setMessage("Publikovanie zaradené do fronty. Sleduj stav nižšie.");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Publikovanie zlyhalo.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Fotografie</h2>
        <input
          type="file"
          multiple
          accept="image/*"
          className="mt-3 text-sm"
          onChange={(e) => uploadPhotos(e.target.files)}
          disabled={busy}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Fotky sa automaticky zmenšia, skomprimujú a prekonvertujú na WebP.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Publikovať na portály</h2>
        <ul className="mt-4 space-y-2">
          {portals.map((p) => {
            const pub = pubByPortal.get(p.key);
            return (
              <li
                key={p.key}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(p.key)}
                    onChange={() => toggle(p.key)}
                    disabled={!p.hasAccount}
                  />
                  <span>{p.name}</span>
                  {!p.hasAccount && (
                    <span className="text-xs text-muted-foreground">
                      (chýba účet — pridaj v sekcii Portály)
                    </span>
                  )}
                </label>
                {pub && (
                  <span className="flex items-center gap-2 text-sm">
                    {STATUS_ICON[pub.status] ?? "⚪"}
                    {pub.remoteUrl && (
                      <a
                        href={pub.remoteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline"
                      >
                        otvoriť
                      </a>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}

        <button
          onClick={publish}
          disabled={busy || selected.size === 0}
          className="mt-4 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Pracujem…" : "Publikovať"}
        </button>
      </section>
    </div>
  );
}
