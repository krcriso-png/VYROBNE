"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Reset page reached from the e-mailed link (?token=…&email=…). Sets a new
// password via /api/auth/reset, then points the user back to sign in.
function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const invalidLink = !token || !email;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Heslo musí mať aspoň 8 znakov.");
      return;
    }
    if (password !== confirm) {
      setError("Heslá sa nezhodujú.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, token, password }),
    });
    setLoading(false);
    if (res.ok) {
      setDone(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Obnovenie hesla zlyhalo.");
    }
  }

  return (
    <div className="w-full max-w-sm">
      <Link href="/" className="mb-8 flex items-center justify-center gap-2">
        <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Layers className="size-5" />
        </div>
        <span className="text-xl font-bold tracking-tight">Klikado</span>
      </Link>

      <div className="rounded-xl border bg-card p-6 shadow-card">
        <h1 className="text-xl font-bold">Nové heslo</h1>

        {done ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg bg-success/10 p-4 text-sm text-success">
              Heslo bolo zmenené. Teraz sa môžeš prihlásiť novým heslom.
            </div>
            <Link
              href="/login"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-soft transition-colors hover:bg-primary/90"
            >
              Prihlásiť sa
            </Link>
          </div>
        ) : invalidLink ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-destructive">
              Odkaz je neúplný alebo neplatný. Požiadaj o nový.
            </p>
            <Link
              href="/forgot-password"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Požiadať o nový odkaz
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Nastav si nové heslo pre <span className="font-medium">{email}</span>.
            </p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">Nové heslo</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={8}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Zopakuj heslo</Label>
                <Input
                  id="confirm"
                  type="password"
                  minLength={8}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Ukladám…" : "Nastaviť heslo"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />
      <Suspense>
        <ResetForm />
      </Suspense>
    </main>
  );
}
