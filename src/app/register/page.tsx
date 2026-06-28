"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Registrácia zlyhala.");
      setLoading(false);
      return;
    }
    // Auto sign-in after successful registration.
    await signIn("credentials", { email, password, callbackUrl: "/dashboard" });
  }

  return (
    <div className="mx-auto mt-24 max-w-sm px-6">
      <h1 className="text-2xl font-bold">Vytvoriť účet</h1>

      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="mt-6 w-full rounded-md border py-2.5 text-sm font-medium hover:bg-muted"
      >
        Registrovať cez Google
      </button>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> alebo{" "}
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          placeholder="Meno (voliteľné)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Heslo (min. 8 znakov)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          disabled={loading}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Vytváram…" : "Vytvoriť účet"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Máš už účet?{" "}
        <Link href="/login" className="text-primary">
          Prihlás sa
        </Link>
      </p>
    </div>
  );
}
