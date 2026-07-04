"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, DownloadCloud, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Import an existing ad from a portal URL: paste the link and Klikado pulls the
// title, description, price and photos, creates the listing and adopts it.
export default function ImportListingPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function importNow(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/listings/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "Import zlyhal. Skús to znova.");
      return;
    }
    // Success — go to the imported listing so the user can review it.
    router.push(`/listings/${data.listingId}`);
    router.refresh();
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
        <h1 className="text-2xl font-bold tracking-tight">
          Pridať existujúci inzerát
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Máš už inzerát na Bazoš SK/CZ alebo Bazar.sk? Vlož naň odkaz a Klikado
          si stiahne názov, popis, cenu aj fotky, vytvorí inzerát a prevezme ho
          pod správu (topovanie, kontrola stavu, mazanie).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DownloadCloud className="size-5 text-primary" /> Odkaz na inzerát
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={importNow} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="url">Odkaz z portálu</Label>
              <Input
                id="url"
                placeholder="https://…bazos.sk/inzerat/…  alebo  https://…bazar.sk/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Podporované: Bazoš SK, Bazoš CZ, Bazar.sk. Odkaz musí byť verejne
                dostupný (nie za prihlásením).
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy || !url.trim()}>
                <Sparkles className="size-4" />
                {busy ? "Importujem…" : "Importovať inzerát"}
              </Button>
              <Link href="/listings/new">
                <Button type="button" variant="outline">
                  Radšej vytvoriť ručne
                </Button>
              </Link>
            </div>
            {busy && (
              <p className="text-xs text-muted-foreground">
                Sťahujem údaje a fotky z portálu — chvíľu to potrvá, počkaj
                prosím na tejto stránke.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
