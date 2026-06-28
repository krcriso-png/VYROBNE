"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Create-listing form. Posts to the API, then redirects to the detail page
// where photos are uploaded and the listing is published.
export default function NewListingPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    currency: "EUR",
    category: "",
    location: "",
    zip: "",
    phone: "",
    contactEmail: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        price: form.price ? Number(form.price) : null,
        contactEmail: form.contactEmail || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Nepodarilo sa vytvoriť inzerát.");
      return;
    }
    const { listing } = await res.json();
    router.push(`/listings/${listing.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/listings"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Späť na inzeráty
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Nový inzerát</h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Základné informácie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Názov *</Label>
              <Input
                id="title"
                required
                placeholder="napr. Záhradný domček 3×4 m"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Popis *</Label>
              <Textarea
                id="desc"
                required
                className="min-h-36"
                placeholder="Podrobný popis inzerátu…"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="price">Cena</Label>
                <Input
                  id="price"
                  type="number"
                  placeholder="0"
                  value={form.price}
                  onChange={(e) => set("price", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Mena</Label>
                <Input
                  id="currency"
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Kategória *</Label>
              <Input
                id="category"
                required
                placeholder="napr. Záhrada / Domčeky"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lokalita a kontakt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="location">Lokalita</Label>
                <Input
                  id="location"
                  placeholder="Mesto"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zip">PSČ</Label>
                <Input
                  id="zip"
                  placeholder="010 01"
                  value={form.zip}
                  onChange={(e) => set("zip", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefón</Label>
                <Input
                  id="phone"
                  placeholder="0900 000 000"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cemail">Kontaktný email</Label>
                <Input
                  id="cemail"
                  type="email"
                  placeholder="ty@email.sk"
                  value={form.contactEmail}
                  onChange={(e) => set("contactEmail", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-3">
          <Link href="/listings">
            <Button type="button" variant="outline">
              Zrušiť
            </Button>
          </Link>
          <Button type="submit" disabled={loading}>
            {loading ? "Vytváram…" : "Vytvoriť a pokračovať"}
          </Button>
        </div>
      </form>
    </div>
  );
}
