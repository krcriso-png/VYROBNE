"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  ExternalLink,
  Send,
  Globe,
  MessageSquareLock,
  AlertTriangle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Dot } from "@/components/ui/badge";
import { PUBLICATION_STATUS } from "@/lib/status";
import { classifyError } from "@/lib/errors";

interface PortalOption {
  key: string;
  name: string;
  integration: string;
  hasAccount: boolean;
  // True when the portal is paused for regular customers (only admins see it).
  paused?: boolean;
}

interface PublicationState {
  id: string;
  portalKey: string;
  status: keyof typeof PUBLICATION_STATUS;
  remoteUrl: string | null;
  smsPrompt: string | null;
  lastError: string | null;
  statusNote: string | null;
}

const LIVE_STATUSES = new Set(["PENDING", "PUBLISHING", "WAITING_SMS", "UPDATING"]);

// Statuses that mean a portal is already published or being processed — these
// should NOT be pre-selected for (re)publishing. Only new / errored / removed
// portals are checked by default, so "Publikovať" targets just what needs it.
const ALREADY_HANDLED = new Set([
  "PENDING",
  "PUBLISHING",
  "WAITING_SMS",
  "UPDATING",
  "PUBLISHED",
]);

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
  const [selected, setSelected] = useState<Set<string>>(() => {
    const next = new Set<string>();
    for (const p of portals) {
      const pub = pubByPortal.get(p.key);
      if (p.hasAccount && !(pub && ALREADY_HANDLED.has(pub.status))) {
        next.add(p.key);
      }
    }
    return next;
  });
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

  async function topovat() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/listings/${listingId}/refresh`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMessage(
      res.ok
        ? `Topovanie zaradené (${data.queued ?? 0}). Inzerát sa zmaže a nahrá znova.`
        : (data.error ?? "Topovanie zlyhalo."),
    );
    router.refresh();
  }

  async function unpublish() {
    if (
      !window.confirm(
        "Naozaj zmazať inzerát zo všetkých portálov, kde je zverejnený? Túto akciu nemožno vrátiť.",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/listings/${listingId}/unpublish`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMessage(
      res.ok
        ? "Mazanie zaradené — inzerát sa čoskoro odstráni z portálov."
        : (data.error ?? "Mazanie zlyhalo."),
    );
    router.refresh();
  }

  async function checkStatus() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/listings/${listingId}/check-status`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setMessage(data.error ?? "Overenie zlyhalo.");
      return;
    }
    setMessage(`Overujem stav na ${data.queued ?? 0} portáloch…`);
    // Poll a few times so the refreshed status/views show up, then confirm.
    let n = 0;
    const t = setInterval(() => {
      router.refresh();
      if (++n >= 6) {
        clearInterval(t);
        setBusy(false);
        setMessage("✅ Hotovo — stav a počet zhliadnutí sú aktualizované.");
        // Auto-clear the confirmation after a moment.
        setTimeout(() => setMessage(null), 6000);
      }
    }, 3000);
  }

  const hasPublished = publications.some((p) => p.status === "PUBLISHED");

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
              <div
                key={p.key}
                className={
                  "rounded-lg border transition-colors " +
                  (checked
                    ? "border-primary/40 bg-primary/5"
                    : "border-input") +
                  (!p.hasAccount ? " opacity-60" : "")
                }
              >
                <label
                  className={
                    "flex items-start gap-3 p-3 " +
                    (p.hasAccount ? "cursor-pointer" : "cursor-not-allowed")
                  }
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-[hsl(var(--primary))]"
                    checked={checked}
                    onChange={() => toggle(p.key)}
                    disabled={!p.hasAccount}
                  />
                  <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <Globe className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      {st && (
                        <Badge tone={st.tone} className="shrink-0">
                          <Dot tone={st.tone} /> {st.label}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {!p.hasAccount
                        ? "Chýba účet — pridaj v sekcii Portály"
                        : p.integration === "BROWSER"
                          ? "Automatizácia prehliadača"
                          : "API"}
                    </p>
                    {p.paused && (
                      <p className="mt-1 inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                        Pozastavené pre zákazníkov — vidíš len ako admin
                      </p>
                    )}
                  </div>
                </label>
                {pub?.remoteUrl && pub.status === "PUBLISHED" && (
                  <div className="border-t border-primary/10 px-3 py-2">
                    <a
                      href={pub.remoteUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="size-3.5" /> Otvoriť inzerát
                    </a>
                  </div>
                )}
                {pub?.status === "ERROR" && (
                  <div className="px-3 pb-3">
                    <PortalError publicationId={pub.id} error={pub.lastError} />
                  </div>
                )}
                {pub?.statusNote && pub.status !== "ERROR" && (
                  <p className="mx-3 mb-3 flex items-start gap-1.5 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{pub.statusNote}</span>
                  </p>
                )}
              </div>
            );
          })}

          {message && (
            <p className="pt-1 text-sm text-muted-foreground">{message}</p>
          )}

          <div className="space-y-2 pt-2">
            <Button
              className="w-full"
              onClick={publish}
              disabled={busy || selected.size === 0}
            >
              <Send className="size-4" />
              {busy ? "Pracujem…" : "Publikovať"}
            </Button>
            {(hasPublished || publications.length > 0) && (
              <div className="grid grid-cols-2 gap-2">
                {hasPublished && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={topovat}
                    disabled={busy}
                    title="Zmaže inzerát a nahrá ho znova (čerstvý dátum)"
                  >
                    <RefreshCw className="size-4" /> Topovať
                  </Button>
                )}
                {publications.length > 0 && (
                  <Button
                    className={"w-full" + (hasPublished ? "" : " col-span-2")}
                    variant="outline"
                    onClick={checkStatus}
                    disabled={busy}
                    title="Overí na portáli, či je inzerát stále zverejnený"
                  >
                    <RefreshCw className="size-4" /> Skontrolovať stav
                  </Button>
                )}
                {hasPublished && (
                  <Button
                    className="col-span-2 w-full text-destructive hover:bg-destructive/10"
                    variant="outline"
                    onClick={unpublish}
                    disabled={busy}
                    title="Zmaže inzerát zo všetkých portálov, kde je zverejnený"
                  >
                    <Trash2 className="size-4" /> Zmazať z portálov
                  </Button>
                )}
              </div>
            )}
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

/** Simplified error message + (for our-side errors) a "report to admin" button. */
function PortalError({
  publicationId,
  error,
}: {
  publicationId: string;
  error: string | null;
}) {
  const { kind, message } = classifyError(error);
  const [state, setState] = useState<"idle" | "sending" | "done" | "fail">(
    "idle",
  );

  async function report() {
    setState("sending");
    const res = await fetch(`/api/publications/${publicationId}/report`, {
      method: "POST",
    });
    setState(res.ok ? "done" : "fail");
  }

  return (
    <div className="mt-1 rounded-md bg-destructive/5 px-3 py-2">
      <p className="flex items-start gap-1.5 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>{message}</span>
      </p>
      {kind === "system" && (
        <div className="mt-2">
          {state === "done" ? (
            <span className="text-xs text-success">
              ✓ Napísané podpore. Ozveme sa ti — sleduj sekciu Podpora.
            </span>
          ) : (
            <>
              <p className="mb-1.5 text-xs text-muted-foreground">
                Túto chybu sme automaticky zaznamenali a pozrieme sa na ňu. Ak
                chceš, napíš nám k tomu.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={report}
                disabled={state === "sending"}
              >
                {state === "sending" ? "Odosielam…" : "Napísať podpore"}
              </Button>
            </>
          )}
          {state === "fail" && (
            <span className="ml-2 text-xs text-destructive">
              Odoslanie zlyhalo.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
