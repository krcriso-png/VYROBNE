"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

// Edit / duplicate / delete actions for a listing detail page.
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

  async function remove() {
    if (
      !confirm(
        "Naozaj zmazať inzerát? Stiahne sa aj z portálov, kde je zverejnený.",
      )
    )
      return;
    setBusy("del");
    const res = await fetch(`/api/listings/${listingId}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) {
      router.push("/listings");
      router.refresh();
    } else {
      alert("Mazanie zlyhalo.");
    }
  }

  return (
    <div className="flex gap-2">
      <Link href={`/listings/${listingId}/edit`}>
        <Button variant="outline" size="sm">
          <Pencil className="size-4" /> Upraviť
        </Button>
      </Link>
      <Button variant="outline" size="sm" onClick={duplicate} disabled={!!busy}>
        <Copy className="size-4" /> Duplikovať
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={remove}
        disabled={!!busy}
        className="text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="size-4" /> Zmazať
      </Button>
    </div>
  );
}
