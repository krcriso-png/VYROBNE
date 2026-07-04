"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryPicker } from "@/components/CategoryPicker";
import { PhotoManager } from "@/components/PhotoManager";
import { bazosCategoryLabel } from "@/lib/bazos-categories";
import { RENEW_OPTIONS } from "@/lib/renew";

type Form = {
  title: string;
  description: string;
  price: string;
  currency: string;
  section: string;
  subcategory: string;
  renewIntervalHours: string;
  location: string;
  zip: string;
  contactName: string;
  phone: string;
  contactEmail: string;
};

const EMPTY: Form = {
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
};

// Edit an existing listing. Saving propagates the change to portals it is
// already published on (the API calls syncListing).
export default function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [images, setImages] = useState<{ id: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/listings/${id}`);
      if (!res.ok) {
        setError("Inzerát sa nepodarilo načítať.");
        setLoading(false);
        return;
      }
      const { listing } = await res.json();
      const params = (listing.parameters ?? {}) as Record<string, unknown>;
      setForm({
        title: listing.title ?? "",
        description: listing.description ?? "",
        price: listing.price != null ? String(listing.price) : "",
        currency: listing.currency ?? "EUR",
        section: (params.bazosSection as string) ?? "",
        subcategory: (params.bazosCategory as string) ?? "",
        renewIntervalHours:
          listing.renewIntervalHours != null
            ? String(listing.renewIntervalHours)
            : "",
        location: listing.location ?? "",
        zip: listing.zip ?? "",
        contactName: listing.contactName ?? "",
        phone: listing.phone ?? "",
        contactEmail: listing.contactEmail ?? "",
      });
      setImages(
        (listing.images ?? []).map((im: { id: string; url: string }) => ({
          id: im.id,
          url: im.url,
        })),
      );
      setLoading(false);
    })();
  }, [id]);

  function set<K extends keyof Form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/listings/${id}`, {
      method: "PATCH",
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
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Uloženie zlyhalo.");
      return;
    }
    router.push(`/listings/${id}`);
    router.refresh();
  }

  const input = "";
  if (loading) {
    return <p className="text-sm text-muted-foreground">Načítavam…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href={`/listings/${id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Späť na inzerát
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Upraviť inzerát</h1>
        <p className="text-sm text-muted-foreground">
          Zmeny sa automaticky prejavia aj na portáloch, kde je inzerát
          zverejnený.
        </p>
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
                className={input}
                required
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
                {RENEW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Inzerát sa automaticky zmaže a nahrá znova, aby bol stále navrchu.
              </p>
              {form.renewIntervalHours && (
                <p className="flex items-start gap-1.5 rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                  <Coins className="mt-0.5 size-3.5 shrink-0" />
                  Každé topovanie stojí 1 kredit za každý portál, na ktorom je
                  inzerát zverejnený.
                </p>
              )}
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
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zip">PSČ</Label>
                <Input
                  id="zip"
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
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefón</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cemail">Kontaktný email</Label>
                <Input
                  id="cemail"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => set("contactEmail", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Photos are managed here (add / reorder / set cover / delete). They
            save immediately. Text edits propagate to live portals on save; new
            photos apply on the next re-publish / topovanie (an in-place edit on
            the portals doesn't swap images). */}
        <PhotoManager listingId={id} images={images} />
        <p className="-mt-3 text-xs text-muted-foreground">
          Fotky sa uložia hneď. Textové zmeny (názov, popis, cena, telefón…) sa
          po uložení automaticky prenesú na všetky portály, kde je inzerát
          zverejnený. Nové fotky sa na portáloch prejavia pri najbližšom
          topovaní alebo opätovnom publikovaní.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-3">
          <Link href={`/listings/${id}`}>
            <Button type="button" variant="outline">
              Zrušiť
            </Button>
          </Link>
          <Button type="submit" disabled={saving}>
            {saving ? "Ukladám…" : "Uložiť zmeny"}
          </Button>
        </div>
      </form>
    </div>
  );
}
