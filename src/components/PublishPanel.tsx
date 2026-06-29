"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  ExternalLink,
  Send,
  Globe,
  MessageSquareLock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Dot } from "@/components/ui/badge";
import { PUBLICATION_STATUS } from "@/lib/status";

interface PortalOption {
  key: string;
  name: string;
  integration: string;
  hasAccount: boolean;
}

interface PublicationState {
  id: string;
  portalKey: string;
  status: keyof typeof PUBLICATION_STATUS;
  remoteUrl: string | null;
  smsPrompt: string | null;
}

const LIVE_STATUSES = new Set(["PENDING", "PUBLISHING", "WAITING_SMS", "UPDATING"]);

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

  // Auto-refresh while anything is in flight (so WAITING_SMS / PUBLISHED appear
  // without a manual reload).
  const inFlight = publications.some((p) => LIVE_STATUSES.has(p.status));
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [inFlight, router]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
      setMessage("Publikovanie zaradené. Sleduj stav nižšie.");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Publikovanie zlyhalo.");
    }
  }

  const waiting = publications.filter((p) => p.status === "WAITING_SMS");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Fotografie</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50">
            <UploadCloud className="size-7 text-muted-foreground" />
            <span className="text-sm font-medium">Klikni a nahraj fotografie</span>
            <span className="text-xs text-muted-foreground">
              Automatický resize, kompresia a konverzia na WebP
            </span>
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => uploadPhotos(e.target.files)}
              disabled={busy}
            />
          </label>
        </CardContent>
      </Card>

      {waiting.map((p) => (
        <SmsPrompt key={p.id} publication={p} onDone={() => router.refresh()} />
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Publikovať na portály</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {portals.map((p) => {
            const pub = pubByPortal.get(p.key);
            const st = pub ? PUBLICATION_STATUS[pub.status] : null;
            const checked = selected.has(p.key);
            return (
              <label
                key={p.key}
                className={
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors " +
                  (checked ? "border-primary/40 bg-primary/5" : "hover:bg-muted/50") +
                  (!p.hasAccount ? " cursor-not-allowed opacity-60" : "")
                }
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[hsl(var(--primary))]"
                  checked={checked}
                  onChange={() => toggle(p.key)}
                  disabled={!p.hasAccount}
                />
                <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Globe className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {!p.hasAccount
                      ? "Chýba účet — pridaj v sekcii Portály"
                      : p.integration === "BROWSER"
                        ? "Automatizácia prehliadača"
                        : "API"}
                  </p>
                </div>
                {st && (
                  <Badge tone={st.tone}>
                    <Dot tone={st.tone} /> {st.label}
                  </Badge>
                )}
                {pub?.remoteUrl && (
                  <a
                    href={pub.remoteUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-primary"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                )}
              </label>
            );
          })}

          {message && (
            <p className="pt-1 text-sm text-muted-foreground">{message}</p>
          )}

          <div className="pt-2">
            <Button onClick={publish} disabled={busy || selected.size === 0}>
              <Send className="size-4" />
              {busy ? "Pracujem…" : "Publikovať"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Inline form shown when a publication is paused waiting for an SMS code. */
function SmsPrompt({
  publication,
  onDone,
}: {
  publication: PublicationState;
  onDone: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/publications/${publication.id}/sms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    setBusy(false);
    if (res.ok) {
      setCode("");
      onDone();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Nepodarilo sa odoslať kód.");
    }
  }

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquareLock className="size-4 text-warning" />
          Potrebné SMS overenie
        </div>
        <p className="text-sm text-muted-foreground">
          {publication.smsPrompt ??
            "Portál poslal overovací kód na tvoj telefón. Zadaj ho sem a Klikado dokončí zverejnenie."}
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="SMS kód"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <Button onClick={submit} disabled={busy || !code.trim()}>
            {busy ? "…" : "Odoslať kód"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
