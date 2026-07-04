"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  UploadCloud,
  X,
  ChevronLeft,
  ChevronRight,
  Star,
  Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryPicker } from "@/components/CategoryPicker";
import { bazosCategoryLabel } from "@/lib/bazos-categories";
import { RENEW_OPTIONS } from "@/lib/renew";

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
  // Selected-but-not-yet-uploaded photos. Selections ACCUMULATE (picking again
  // adds more instead of replacing), and can be reordered — the first one is
  // the cover/title photo.
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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

  // Preview URLs for the selected photos (revoked when the selection changes).
  const previews = useMemo(
    () => photos.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
    [photos],
  );
  useEffect(
    () => () => previews.forEach((p) => URL.revokeObjectURL(p.url)),
    [previews],
  );

  // Append newly picked files (deduped by name+size), so multiple picks add up.
  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setPhotos((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const next = [...prev];
      for (const f of Array.from(list)) {
        const k = `${f.name}:${f.size}`;
        if (!seen.has(k)) {
          seen.add(k);
          next.push(f);
        }
      }
      return next;
    });
  }
  function removePhoto(i: number) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
  }
  function movePhoto(i: number, dir: -1 | 1) {
    setPhotos((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function makeCover(i: number) {
    setPhotos((prev) => {
      if (i <= 0 || i >= prev.length) return prev;
      const next = prev.slice();
      const [pick] = next.splice(i, 1);
      next.unshift(pick);
      return next;
    });
  }

  // Read a File as bare base64 (without the data: URL prefix).
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result);
        resolve(res.includes(",") ? res.split(",")[1] : res);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Ask the AI to draft a title/description/price from the first photo and/or
  // the title field, then fill the form with the result.
  async function generateWithAi() {
    setAiLoading(true);
    setAiError(null);
    try {
      const payload: Record<string, unknown> = {
        hint: form.title || undefined,
        category:
          form.section && form.subcategory
            ? bazosCategoryLabel(form.section, form.subcategory)
            : undefined,
      };
      const photo = photos[0];
      if (photo) {
        payload.imageBase64 = await fileToBase64(photo);
        payload.imageMediaType = photo.type || "image/jpeg";
      }
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error ?? "Generovanie zlyhalo.");
        return;
      }
      setForm((f) => ({
        ...f,
        title: data.title || f.title,
        description: data.description || f.description,
        price: data.price ? String(data.price) : f.price,
      }));
    } catch {
      setAiError("Generovanie zlyhalo. Skús to znova.");
    } finally {
      setAiLoading(false);
    }
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

    // Upload the selected photos in the chosen order (first = cover), so it's
    // all one step.
    if (photos.length > 0) {
      const fd = new FormData();
      photos.forEach((f) => fd.append("files", f));
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
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                <Sparkles className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Napíš inzerát za teba</p>
                <p className="text-xs text-muted-foreground">
                  Nahraj fotku alebo napíš pár slov do názvu a AI vytvorí názov,
                  popis aj odhad ceny. (1 kredit)
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={generateWithAi}
              disabled={aiLoading}
              className="shrink-0"
            >
              <Sparkles className="size-4" />
              {aiLoading ? "Generujem…" : "Vygenerovať AI"}
            </Button>
          </CardContent>
        </Card>
        {aiError && <p className="-mt-3 text-sm text-destructive">{aiError}</p>}

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
                  placeholder="+421 900 000 000"
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
          <CardContent className="space-y-3">
            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {previews.map((p, i) => (
                  <div
                    key={p.url}
                    className="relative aspect-square overflow-hidden rounded-lg border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt=""
                      className="size-full object-cover"
                    />
                    {i === 0 && (
                      <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        Titulná
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      title="Odobrať fotku"
                      className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/50 px-1.5 py-1">
                      <button
                        type="button"
                        onClick={() => movePhoto(i, -1)}
                        disabled={i === 0}
                        title="Posunúť dozadu"
                        className="grid size-6 place-items-center rounded text-white disabled:opacity-30"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => makeCover(i)}
                        disabled={i === 0}
                        title="Nastaviť ako titulnú"
                        className="grid size-6 place-items-center rounded text-white disabled:opacity-30"
                      >
                        <Star
                          className={"size-4 " + (i === 0 ? "fill-white" : "")}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePhoto(i, 1)}
                        disabled={i === previews.length - 1}
                        title="Posunúť dopredu"
                        className="grid size-6 place-items-center rounded text-white disabled:opacity-30"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input p-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/50">
              <UploadCloud className="size-6 text-muted-foreground" />
              <span className="text-sm font-medium">
                {previews.length > 0
                  ? `Pridať ďalšie (${previews.length} vybraných)`
                  : "Klikni a vyber fotografie"}
              </span>
              <span className="text-xs text-muted-foreground">
                Naraz aj viac fotiek · prvá je titulná · poradie zmeníš šípkami
              </span>
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = ""; // allow re-picking the same file
                }}
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
