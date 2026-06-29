"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Layers, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name, phone }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Registrácia zlyhala.");
      setLoading(false);
      return;
    }
    await signIn("credentials", { email, password, callbackUrl: "/dashboard" });
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 py-10">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Layers className="size-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">Klikado</span>
        </Link>

        <div className="rounded-xl border bg-card p-6 shadow-card">
          <h1 className="text-xl font-bold">Vytvor si účet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            7 dní zadarmo · bez záväzkov
          </p>

          <Button
            variant="outline"
            className="mt-6 w-full"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          >
            Registrovať cez Google
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> alebo
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Meno</Label>
              <Input
                id="name"
                placeholder="Tvoje meno"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefón</Label>
              <Input
                id="phone"
                placeholder="+421 900 000 000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Vo formáte +421… — predvyplní sa do inzerátov a funguje aj na
                českom Bazoši.
              </p>
            </div>
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
            <div className="space-y-1.5">
              <Label htmlFor="password">Heslo</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                placeholder="min. 8 znakov"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Vytváram…" : "Vytvoriť účet"}
            </Button>
          </form>

          <ul className="mt-5 space-y-1.5 text-xs text-muted-foreground">
            {["Všetky portály", "Automatická obnova", "Zruš kedykoľvek"].map(
              (f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="size-3.5 text-success" /> {f}
                </li>
              ),
            )}
          </ul>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Máš už účet?{" "}
          <Link href="/login" className="font-medium text-primary">
            Prihlás sa
          </Link>
        </p>
      </div>
    </main>
  );
}
