"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });
    setLoading(false);
    if (res?.error) {
      setError("Nesprávny email alebo heslo.");
    } else {
      window.location.href = callbackUrl;
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm px-6">
      <h1 className="text-2xl font-bold">Prihlásenie</h1>

      <button
        onClick={() => signIn("google", { callbackUrl })}
        className="mt-6 w-full rounded-md border py-2.5 text-sm font-medium hover:bg-muted"
      >
        Pokračovať cez Google
      </button>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> alebo{" "}
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
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
          placeholder="Heslo"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          disabled={loading}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Prihlasujem…" : "Prihlásiť sa"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Nemáš účet?{" "}
        <Link href="/register" className="text-primary">
          Zaregistruj sa
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
