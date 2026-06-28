"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";

// Duplicate / archive actions for a listing detail page.
export function ListingActions({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function duplicate() {
    setBusy("dup");
    const res = await fetch(`/api/listings/${listingId}/duplicate`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (data.listing?.id) router.push(`/listings/${data.listing.id}`);
  }

  async function archive() {
    if (!confirm("Naozaj archivovať a stiahnuť z portálov?")) return;
    setBusy("arch");
    await fetch(`/api/listings/${listingId}`, { method: "DELETE" });
    setBusy(null);
    router.push("/listings");
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={duplicate} disabled={!!busy}>
        <Copy className="size-4" /> Duplikovať
      </Button>
      <Button variant="outline" size="sm" onClick={archive} disabled={!!busy}>
        <Archive className="size-4" /> Archivovať
      </Button>
    </div>
  );
}
