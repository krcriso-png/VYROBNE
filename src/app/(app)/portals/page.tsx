"use client";

import { useEffect, useState } from "react";
import { Globe, Check, ChevronDown, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface Portal {
  key: string;
  name: string;
  country: string;
  integration: string;
  hasAccount: boolean;
  login: string;
  verifyPhone: string;
  hasPassword: boolean;
}

// Manage saved portal logins. Credentials are sent once and stored encrypted;
// the API never returns the password back.
export default function PortalsPage() {
  const [portals, setPortals] = useState<Portal[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [verifyPhone, setVerifyPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The saved password shown after clicking the eye (fetched on demand).
  const [revealed, setRevealed] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/portals");
    const data = await res.json();
    setPortals(data.portals ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  // Open a portal's editor and pre-fill it with what's already saved, so the
  // user sees the current values instead of a blank form (and doesn't wipe them
  // by saving). The password is never returned — left blank, only overwritten
  // if the user types a new one.
  function openEditor(p: Portal) {
    if (active === p.key) {
      setActive(null);
      return;
    }
    setActive(p.key);
    setLogin(p.login ?? "");
    setVerifyPhone(p.verifyPhone ?? "");
    setPassword("");
    setRevealed(null);
    setMessage(null);
  }

  // Fetch + show (or hide) the saved password for a portal.
  async function toggleReveal(portalKey: string) {
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    const res = await fetch("/api/portal-accounts/reveal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ portalKey }),
    });
    const data = await res.json().catch(() => ({}));
    setRevealed(res.ok ? (data.password ?? "") : "");
  }

  async function save(portalKey: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/portal-accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ portalKey, login, password, verifyPhone }),
    });
    setBusy(false);
    if (res.ok) {
      setMessage("Účet uložený a zašifrovaný.");
      setActive(null);
      setLogin("");
      setPassword("");
      setVerifyPhone("");
      load();
    } else {
      setMessage("Uloženie zlyhalo.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Portály</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ulož prihlasovacie údaje pre jednotlivé portály. Heslá sú šifrované
          (AES-256-GCM) a použijú sa len na pridávanie tvojich inzerátov.
          Zobraziť si svoje uložené heslo vieš kliknutím na „Zobraziť uložené".
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
          {message}
        </div>
      )}

      <div className="space-y-3">
        {portals.map((p) => (
          <Card key={p.key} className="overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Globe className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{p.name}</p>
                  {p.hasAccount && (
                    <Badge tone="success">
                      <Check className="size-3" /> pripojené
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.country} ·{" "}
                  {p.integration === "BROWSER"
                    ? "Automatizácia prehliadača"
                    : "API"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditor(p)}
              >
                {p.hasAccount ? "Upraviť" : "Pripojiť"}
                <ChevronDown
                  className={
                    "size-4 transition-transform " +
                    (active === p.key ? "rotate-180" : "")
                  }
                />
              </Button>
            </div>

            {active === p.key && (
              <div className="space-y-3 border-t bg-muted/30 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`login-${p.key}`}>Login / email</Label>
                  <Input
                    id={`login-${p.key}`}
                    placeholder="tvoj login na portáli"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`pass-${p.key}`}>Heslo k inzerátu</Label>
                    {p.hasPassword && (
                      <button
                        type="button"
                        onClick={() => toggleReveal(p.key)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        {revealed !== null ? (
                          <>
                            <EyeOff className="size-3.5" /> Skryť uložené
                          </>
                        ) : (
                          <>
                            <Eye className="size-3.5" /> Zobraziť uložené
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <Input
                    id={`pass-${p.key}`}
                    type="password"
                    placeholder={p.hasPassword ? "•••••••• (uložené)" : "••••••••"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {revealed !== null && (
                    <p className="rounded-md border bg-background px-3 py-2 text-sm">
                      Uložené heslo:{" "}
                      <span className="font-mono font-medium select-all">
                        {revealed || "(žiadne)"}
                      </span>
                    </p>
                  )}
                  {p.hasPassword && (
                    <p className="text-xs text-muted-foreground">
                      Heslo je uložené. Nechaj prázdne, ak ho nechceš meniť.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`vphone-${p.key}`}>
                    Telefón na SMS overenie
                  </Label>
                  <Input
                    id={`vphone-${p.key}`}
                    placeholder="napr. 0911 123 456 (tvoj telefón pre SMS kód)"
                    value={verifyPhone}
                    onChange={(e) => setVerifyPhone(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sem chodí overovací SMS kód. Nemusí sa zhodovať s číslom
                    v inzeráte. Ak necháš prázdne, použije sa telefón z inzerátu.
                  </p>
                </div>
                <Button onClick={() => save(p.key)} disabled={busy} size="sm">
                  {busy ? "Ukladám…" : "Uložiť"}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
