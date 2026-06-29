"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryPicker } from "@/components/CategoryPicker";
import { bazosCategoryLabel } from "@/lib/bazos-categories";

// Create-listing form. Posts to the API, then redirects to the detail page
// where photos are uploaded and the listing is published.
export default function NewListingPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    currency: "EUR",
    section: "",
    subcategory: "",
    renewIntervalHours: "",
    location: "",
    zip: "",
    contactName: "",
    phone: "",
    contactEmail: "",
  });
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Pre-fill contact name + email from the logged-in account (editable).
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(
        (me: {
          name: string | null;
          email: string | null;
          phone: string | null;
        }) => {
          setForm((f) => ({
            ...f,
            contactName:
              f.contactName ||
              me.name ||
              (me.email ? me.email.split("@")[0] : ""),
            contactEmail: f.contactEmail || me.email || "",
            phone: f.phone || me.phone || "",
          }));
        },
      )
      .catch(() => undefined);
  }, []);

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
        title: form.title,
        description: form.description,
        price: form.price ? Number(form.price) : null,
        currency: form.currency,
        category: bazosCategoryLabel(form.section, form.subcategory),
        parameters: {
          bazosSection: form.section,
          bazosCategory: form.subcategory,
        },
        renewIntervalHours: form.renewIntervalHours
          ? Number(form.renewIntervalHours)
          : null,
        location: form.location || null,
        zip: form.zip || null,
        contactName: form.contactName || null,
        phone: form.phone || null,
        contactEmail: form.contactEmail || null,
      }),
    });
    if (!res.ok) {
      setLoading(false);
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Nepodarilo sa vytvoriť inzerát.");
      return;
    }
    const { listing } = await res.json();

    // Upload any selected photos right away (so it's all one step).
    if (files && files.length > 0) {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      await fetch(`/api/listings/${listing.id}/images`, {
        method: "POST",
        body: fd,
      }).catch(() => undefined);
    }

    setLoading(false);
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
            <CategoryPicker
              section={form.section}
              subcategory={form.subcategory}
              onChange={(section, subcategory) =>
                setForm((f) => ({ ...f, section, subcategory }))
              }
            />
            <div className="space-y-1.5">
              <Label htmlFor="renew">Automatické topovanie</Label>
              <Select
                id="renew"
                value={form.renewIntervalHours}
                onChange={(e) => set("renewIntervalHours", e.target.value)}
              >
                <option value="">Vypnuté</option>
                <option value="24">Každých 24 hodín</option>
                <option value="48">Každých 48 hodín</option>
                <option value="168">Každý týždeň</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Inzerát sa automaticky zmaže a nahrá znova, aby bol stále navrchu.
              </p>
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
            <div className="space-y-1.5">
              <Label htmlFor="contactName">Meno (kontakt) *</Label>
              <Input
                id="contactName"
                required
                placeholder="Tvoje meno (zobrazí sa v inzeráte)"
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
              />
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

        <Card>
          <CardHeader>
            <CardTitle>Fotografie</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50">
              <span className="text-sm font-medium">
                {files && files.length > 0
                  ? `${files.length} fotiek vybraných`
                  : "Klikni a vyber fotografie"}
              </span>
              <span className="text-xs text-muted-foreground">
                Prvá fotka je hlavná · automatický resize a konverzia na WebP
              </span>
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => setFiles(e.target.files)}
              />
            </label>
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
