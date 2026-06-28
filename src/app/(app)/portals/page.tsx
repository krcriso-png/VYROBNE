"use client";

import { useEffect, useState } from "react";

interface Portal {
  key: string;
  name: string;
  integration: string;
  hasAccount: boolean;
}

// Manage saved portal logins. Credentials are sent once and stored encrypted;
// the API never returns the password back.
export default function PortalsPage() {
  const [portals, setPortals] = useState<Portal[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/portals");
    const data = await res.json();
    setPortals(data.portals ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(portalKey: string) {
    setMessage(null);
    const res = await fetch("/api/portal-accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ portalKey, login, password }),
    });
    if (res.ok) {
      setMessage("Účet uložený.");
      setActive(null);
      setLogin("");
      setPassword("");
      load();
    } else {
      setMessage("Uloženie zlyhalo.");
    }
  }

  const input = "w-full rounded-md border bg-background px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Portály</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ulož prihlasovacie údaje pre jednotlivé portály. Heslá sú šifrované
        (AES-256-GCM) a nikdy sa nezobrazujú späť.
      </p>

      {message && <p className="mt-4 text-sm text-primary">{message}</p>}

      <ul className="mt-6 space-y-3">
        {portals.map((p) => (
          <li key={p.key} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.integration === "BROWSER" ? "Automatizácia prehliadača" : "API"}
                  {p.hasAccount ? " · účet pripojený ✓" : ""}
                </p>
              </div>
              <button
                onClick={() => setActive(active === p.key ? null : p.key)}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                {p.hasAccount ? "Upraviť" : "Pripojiť"}
              </button>
            </div>

            {active === p.key && (
              <div className="mt-4 space-y-2">
                <input
                  className={input}
                  placeholder="Login / email"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                />
                <input
                  className={input}
                  type="password"
                  placeholder="Heslo"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  onClick={() => save(p.key)}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Uložiť
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
