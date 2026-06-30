"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Plus,
  CheckCircle2,
  Circle,
  MessageSquare,
  UploadCloud,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Dot } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { PUBLICATION_STATUS } from "@/lib/status";

export interface SupportMessageDTO {
  id: string;
  author: "USER" | "ADMIN";
  body: string;
  createdAt: string;
}

export interface SupportThreadDTO {
  id: string;
  subject: string;
  status: "OPEN" | "CLOSED";
  userEmail?: string;
  listingId?: string;
  portalKey?: string;
  listingTitle?: string;
  portalStatus?: string;
  createdAt: string;
  messages: SupportMessageDTO[];
}

export function SupportThreads({
  threads,
  isAdmin,
}: {
  threads: SupportThreadDTO[];
  isAdmin: boolean;
}) {
  return (
    <div className="space-y-6">
      {!isAdmin && <NewThread />}

      {threads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <MessageSquare className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? "Zatiaľ žiadne podnety od používateľov."
                : "Zatiaľ nemáš žiadne podnety. Napíš nám vyššie."}
            </p>
          </CardContent>
        </Card>
      ) : (
        threads.map((t) => (
          <Thread key={t.id} thread={t} isAdmin={isAdmin} />
        ))
      )}
    </div>
  );
}

/** New-thread form (users only). */
function NewThread() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (subject.trim().length < 2 || body.trim().length < 2) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, body }),
    });
    setBusy(false);
    if (res.ok) {
      setSubject("");
      setBody("");
      setOpen(false);
      setMsg("Podnet odoslaný. Ozveme sa ti čo najskôr.");
      router.refresh();
    } else {
      setMsg("Odoslanie zlyhalo, skús to znova.");
    }
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        {msg ? (
          <p className="text-sm text-success">{msg}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Napíš nám podnet, otázku alebo nahlás chybu.
          </p>
        )}
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Nový podnet
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nový podnet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Predmet (napr. Nefunguje publikovanie)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <textarea
          placeholder="Popíš, s čím potrebuješ pomôcť…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-focus"
        />
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy}>
            <Send className="size-4" /> {busy ? "Odosielam…" : "Odoslať"}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Zrušiť
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** A single thread with its messages + a reply box. */
function Thread({
  thread,
  isAdmin,
}: {
  thread: SupportThreadDTO;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/support/${thread.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    setBusy(false);
    if (res.ok) {
      setReply("");
      router.refresh();
    }
  }

  async function toggleStatus() {
    setBusy(true);
    await fetch(`/api/support/${thread.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: thread.status === "OPEN" ? "CLOSED" : "OPEN",
      }),
    });
    setBusy(false);
    router.refresh();
  }

  async function adminAction(action: "republish" | "recheck") {
    setBusy(true);
    await fetch(`/api/admin/support/${thread.id}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    router.refresh();
  }

  const closed = thread.status === "CLOSED";
  const ps = thread.portalStatus
    ? PUBLICATION_STATUS[thread.portalStatus as keyof typeof PUBLICATION_STATUS]
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="truncate">{thread.subject}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAdmin && thread.userEmail ? `${thread.userEmail} · ` : ""}
            {formatDate(thread.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={closed ? "neutral" : "success"}>
            {closed ? "Uzavreté" : "Otvorené"}
          </Badge>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={toggleStatus}
              disabled={busy}
              title={closed ? "Znovu otvoriť" : "Označiť ako vyriešené"}
            >
              {closed ? (
                <Circle className="size-4" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              {closed ? "Otvoriť" : "Vyriešené"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin && thread.listingId && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
            <div className="mr-auto min-w-0">
              <p className="truncate text-sm font-medium">
                {thread.listingTitle ?? "Inzerát zákazníka"}
              </p>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                Portál: {thread.portalKey ?? "—"}
                {ps && (
                  <Badge tone={ps.tone}>
                    <Dot tone={ps.tone} /> {ps.label}
                  </Badge>
                )}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => adminAction("republish")}
              disabled={busy || !thread.portalKey}
              title="Spustiť publikovanie znova za zákazníka"
            >
              <UploadCloud className="size-4" /> Publikovať znova
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => adminAction("recheck")}
              disabled={busy}
              title="Overiť aktuálny stav na portáli"
            >
              <RefreshCw className="size-4" /> Skontrolovať stav
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {thread.messages.map((m) => {
            const mine = isAdmin ? m.author === "ADMIN" : m.author === "USER";
            const shot = m.body.match(
              /https?:\/\/\S+\/api\/blob\/\S+\.png/i,
            )?.[0];
            return (
              <div
                key={m.id}
                className={"flex " + (mine ? "justify-end" : "justify-start")}
              >
                <div
                  className={
                    "max-w-[85%] rounded-2xl px-4 py-2 text-sm " +
                    (m.author === "ADMIN"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground")
                  }
                >
                  <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide opacity-70">
                    {m.author === "ADMIN" ? "Podpora" : "Používateľ"}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  {shot && (
                    <a href={shot} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shot}
                        alt="Screenshot chyby"
                        className="mt-2 max-h-56 rounded-lg border border-white/20 object-contain"
                      />
                    </a>
                  )}
                  <p className="mt-1 text-[10px] opacity-60">
                    {formatDate(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            placeholder={isAdmin ? "Odpovedz používateľovi…" : "Napíš odpoveď…"}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
            rows={2}
            className="min-h-[44px] flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-focus"
          />
          <Button onClick={send} disabled={busy || !reply.trim()}>
            <Send className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
