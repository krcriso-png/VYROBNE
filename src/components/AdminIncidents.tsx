"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  UploadCloud,
  RefreshCw,
  MessageSquare,
  Send,
  ImageIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export interface IncidentDTO {
  id: string; // publication id
  listingTitle: string;
  userEmail: string;
  portalName: string;
  error: string;
  screenshot?: string;
  createdAt: string;
}

export function AdminIncidents({ incidents }: { incidents: IncidentDTO[] }) {
  if (incidents.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Žiadne chyby publikovania. 🎉
      </Card>
    );
  }
  return (
    <Card className="divide-y">
      {incidents.map((i) => (
        <Incident key={i.id} incident={i} />
      ))}
    </Card>
  );
}

function Incident({ incident }: { incident: IncidentDTO }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState<string | null>(null);

  async function action(action: "republish" | "recheck") {
    setBusy(true);
    setDone(null);
    await fetch(`/api/admin/publications/${incident.id}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    setDone(
      action === "republish"
        ? "Publikovanie spustené."
        : "Overenie stavu spustené.",
    );
    router.refresh();
  }

  async function sendMessage() {
    if (!msg.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/admin/publications/${incident.id}/contact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: msg }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg("");
      setComposing(false);
      setDone("Správa odoslaná zákazníkovi (ticket vytvorený).");
      router.refresh();
    }
  }

  return (
    <div className="p-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{incident.listingTitle}</p>
          <p className="truncate text-xs text-muted-foreground">
            {incident.userEmail} · {incident.portalName} ·{" "}
            {formatDate(incident.createdAt)}
          </p>
          <p className="mt-1 text-xs text-destructive">{incident.error}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => action("republish")} disabled={busy}>
              <UploadCloud className="size-4" /> Publikovať znova
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => action("recheck")}
              disabled={busy}
            >
              <RefreshCw className="size-4" /> Skontrolovať stav
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setComposing((v) => !v)}
              disabled={busy}
            >
              <MessageSquare className="size-4" /> Napísať zákazníkovi
            </Button>
            {incident.screenshot && (
              <a
                href={incident.screenshot}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <ImageIcon className="size-3.5" /> Screenshot
              </a>
            )}
          </div>

          {composing && (
            <div className="mt-2 flex items-end gap-2">
              <textarea
                placeholder="Napíš zákazníkovi (otvorí sa ticket)…"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                rows={2}
                className="min-h-[44px] flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-focus"
              />
              <Button onClick={sendMessage} disabled={busy || !msg.trim()}>
                <Send className="size-4" />
              </Button>
            </div>
          )}

          {done && <p className="mt-2 text-xs text-success">{done}</p>}
        </div>
      </div>
    </div>
  );
}
