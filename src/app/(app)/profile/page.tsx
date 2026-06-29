"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Profile / account settings — edit name, email, phone and optionally change
// the password. The phone here is what pre-fills into new listings.
export default function ProfilePage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((me: { name: string | null; email: string | null; phone: string | null }) => {
        setForm({
          name: me.name ?? "",
          email: me.email ?? "",
          phone: me.phone ?? "",
        });
        setLoading(false);
      })
      .catch(() => {
        setError("Profil sa nepodarilo načítať.");
        setLoading(false);
      });
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name || null,
        email: form.email,
        phone: form.phone || null,
        ...(password ? { password } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Uloženie zlyhalo.");
      return;
    }
    setPassword("");
    setSaved(true);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Načítavam…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Môj profil</h1>
        <p className="text-sm text-muted-foreground">
          Tu zmeníš svoje údaje. Telefón a meno sa predvyplnia do nových
          inzerátov.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Osobné údaje</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Meno</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Tvoje meno"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Email používaš aj na prihlásenie.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefón</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="0900 000 000"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Zmena hesla</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label htmlFor="password">Nové heslo</Label>
              <Input
                id="password"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setSaved(false);
                }}
                placeholder="Nechaj prázdne, ak nemeníš"
              />
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && <p className="text-sm text-success">Uložené ✓</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Ukladám…" : "Uložiť zmeny"}
          </Button>
        </div>
      </form>
    </div>
  );
}
