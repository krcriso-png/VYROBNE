"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Minimal create-listing form. Posts to the API, then redirects to the detail
// page where photos are uploaded and the listing is published.
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

  const input =
    "w-full rounded-md border bg-background px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Nový inzerát</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <input
          className={input}
          placeholder="Názov *"
          required
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
        />
        <textarea
          className={`${input} min-h-32`}
          placeholder="Popis *"
          required
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <input
            className={input}
            placeholder="Cena"
            type="number"
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
          />
          <input
            className={input}
            placeholder="Mena"
            value={form.currency}
            onChange={(e) => set("currency", e.target.value)}
          />
        </div>
        <input
          className={input}
          placeholder="Kategória *"
          required
          value={form.category}
          onChange={(e) => set("category", e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <input
            className={input}
            placeholder="Lokalita"
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
          />
          <input
            className={input}
            placeholder="PSČ"
            value={form.zip}
            onChange={(e) => set("zip", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <input
            className={input}
            placeholder="Telefón"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
          <input
            className={input}
            placeholder="Kontaktný email"
            type="email"
            value={form.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          disabled={loading}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Vytváram…" : "Vytvoriť a pokračovať"}
        </button>
      </form>
    </div>
  );
}
