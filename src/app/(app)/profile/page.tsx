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
  const [currentPassword, setCurrentPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const EMPTY_BILLING = {
    billingName: "",
    billingIco: "",
    billingDic: "",
    billingVatId: "",
    billingStreet: "",
    billingCity: "",
    billingZip: "",
    billingCountry: "SK",
  };
  const [billing, setBillingState] = useState(EMPTY_BILLING);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingSaved, setBillingSaved] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

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
    fetch("/api/billing/profile")
      .then((r) => r.json())
      .then((b: Record<string, string | null>) => {
        setBillingState({
          billingName: b.billingName ?? "",
          billingIco: b.billingIco ?? "",
          billingDic: b.billingDic ?? "",
          billingVatId: b.billingVatId ?? "",
          billingStreet: b.billingStreet ?? "",
          billingCity: b.billingCity ?? "",
          billingZip: b.billingZip ?? "",
          billingCountry: b.billingCountry ?? "SK",
        });
      })
      .catch(() => {});
  }, []);

  function setBilling<K extends keyof typeof billing>(key: K, value: string) {
    setBillingState((b) => ({ ...b, [key]: value }));
    setBillingSaved(false);
  }

  async function saveBilling(e: React.FormEvent) {
    e.preventDefault();
    setBillingSaving(true);
    setBillingError(null);
    setBillingSaved(false);
    const res = await fetch("/api/billing/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(billing),
    });
    setBillingSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBillingError(data.error ?? "Uloženie zlyhalo.");
      return;
    }
    setBillingSaved(true);
  }

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
        ...(password ? { password, currentPassword } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Uloženie zlyhalo.");
      return;
    }
    setPassword("");
    setCurrentPassword("");
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
                placeholder="+421 900 000 000"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Zmena hesla</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Súčasné heslo</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setSaved(false);
                }}
                placeholder="Zadaj len pri zmene hesla"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Nové heslo</Label>
              <Input
                id="password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setSaved(false);
                }}
                placeholder="Nechaj prázdne, ak nemeníš"
              />
              <p className="text-xs text-muted-foreground">
                Pri zmene hesla musíš zadať aj svoje súčasné heslo.
              </p>
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

      <form onSubmit={saveBilling}>
        <Card>
          <CardHeader>
            <CardTitle>Fakturačné údaje (firma)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vyplň, ak chceš faktúry na firmu. Údaje sa použijú na faktúre za
              predplatné (názov, adresa, IČO, DIČ, IČ DPH).
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="billingName">Názov firmy</Label>
              <Input
                id="billingName"
                value={billing.billingName}
                onChange={(e) => setBilling("billingName", e.target.value)}
                placeholder="Napr. Firma s. r. o."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="billingIco">IČO</Label>
                <Input
                  id="billingIco"
                  value={billing.billingIco}
                  onChange={(e) => setBilling("billingIco", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billingDic">DIČ</Label>
                <Input
                  id="billingDic"
                  value={billing.billingDic}
                  onChange={(e) => setBilling("billingDic", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billingVatId">IČ DPH</Label>
                <Input
                  id="billingVatId"
                  value={billing.billingVatId}
                  onChange={(e) => setBilling("billingVatId", e.target.value)}
                  placeholder="SK…"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="billingStreet">Ulica a číslo</Label>
              <Input
                id="billingStreet"
                value={billing.billingStreet}
                onChange={(e) => setBilling("billingStreet", e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="billingZip">PSČ</Label>
                <Input
                  id="billingZip"
                  value={billing.billingZip}
                  onChange={(e) => setBilling("billingZip", e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="billingCity">Mesto</Label>
                <Input
                  id="billingCity"
                  value={billing.billingCity}
                  onChange={(e) => setBilling("billingCity", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="billingCountry">Krajina (kód)</Label>
              <Input
                id="billingCountry"
                value={billing.billingCountry}
                onChange={(e) =>
                  setBilling("billingCountry", e.target.value.toUpperCase())
                }
                maxLength={2}
                placeholder="SK"
                className="max-w-24"
              />
            </div>

            {billingError && (
              <p className="text-sm text-destructive">{billingError}</p>
            )}
            {billingSaved && (
              <p className="text-sm text-success">Fakturačné údaje uložené ✓</p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={billingSaving}>
                {billingSaving ? "Ukladám…" : "Uložiť fakturačné údaje"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
