"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Photo {
  id: string;
  url: string;
}

// Manage a listing's photos: add several at once, reorder (the FIRST photo is
// the cover/title photo on every portal), set any photo as cover, and delete.
export function PhotoManager({
  listingId,
  images,
}: {
  listingId: string;
  images: Photo[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<Photo[]>(images);
  const [busy, setBusy] = useState(false);

  async function persistOrder(next: Photo[]) {
    setItems(next);
    await fetch(`/api/listings/${listingId}/images`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order: next.map((p) => p.id) }),
    }).catch(() => {});
    router.refresh();
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    persistOrder(next);
  }

  function makeCover(i: number) {
    if (i === 0) return;
    const next = items.slice();
    const [pick] = next.splice(i, 1);
    next.unshift(pick);
    persistOrder(next);
  }

  async function remove(id: string) {
    if (!window.confirm("Zmazať túto fotku z inzerátu?")) return;
    setItems((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/listings/${listingId}/images`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageId: id }),
    }).catch(() => {});
    router.refresh();
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const res = await fetch(`/api/listings/${listingId}/images`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && Array.isArray(data.images)) {
      setItems((prev) => [
        ...prev,
        ...data.images.map((im: { id: string; url: string }) => ({
          id: im.id,
          url: im.url,
        })),
      ]);
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fotografie</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items.map((p, i) => (
              <div
                key={p.id}
                className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
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
                  onClick={() => remove(p.id)}
                  title="Zmazať fotku"
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-destructive"
                >
                  <X className="size-3.5" />
                </button>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/50 px-1.5 py-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
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
                    <Star className={"size-4 " + (i === 0 ? "fill-white" : "")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
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
            {busy ? "Nahrávam…" : "Pridať fotky"}
          </span>
          <span className="text-xs text-muted-foreground">
            Naraz aj viac fotiek · prvá je titulná · poradie zmeníš šípkami
          </span>
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => upload(e.target.files)}
          />
        </label>
      </CardContent>
    </Card>
  );
}
