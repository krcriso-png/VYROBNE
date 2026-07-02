"use client";

import { useState } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// "Forgot password" — ask for the e-mail; the API mails a reset link. We always
// show the same success message so the form never reveals whether an account
// with that address exists.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    setSent(true);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Layers className="size-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">Klikado</span>
        </Link>

        <div className="rounded-xl border bg-card p-6 shadow-card">
          <h1 className="text-xl font-bold">Zabudnuté heslo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Zadaj svoj email a pošleme ti odkaz na obnovenie hesla.
          </p>

          {sent ? (
            <div className="mt-6 rounded-lg bg-success/10 p-4 text-sm text-success">
              Ak k tomuto emailu existuje účet, poslali sme naň odkaz na
              obnovenie hesla. Skontroluj si schránku (aj priečinok Spam).
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="ty@email.sk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Odosielam…" : "Poslať odkaz"}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary">
            Späť na prihlásenie
          </Link>
        </p>
      </div>
    </main>
  );
}
