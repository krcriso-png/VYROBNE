"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ImageOff, Globe, AlertTriangle, ArrowRight, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LISTING_STATUS, displayListingStatus } from "@/lib/status";
import { formatPrice } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface BrowserListing {
  id: string;
  title: string;
  category: string;
  price: string | null;
  currency: string;
  status: keyof typeof LISTING_STATUS;
  mainUrl: string | null;
  published: number;
  total: number;
  errored: boolean;
}

const FILTERS = [
  { key: "ALL", label: "Všetky" },
  { key: "ACTIVE", label: "Aktívne" },
  { key: "DRAFT", label: "Koncepty" },
] as const;

export function ListingsBrowser({ listings }: { listings: BrowserListing[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("ALL");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings.filter((l) => {
      if (filter !== "ALL" && l.status !== filter) return false;
      if (!q) return true;
      return (
        l.title.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q)
      );
    });
  }, [listings, query, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Hľadať podľa názvu alebo kategórie…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nič nezodpovedá filtru.
        </p>
      ) : (
        <div className="grid gap-3">
          {shown.map((l) => {
            const st = displayListingStatus(l.status, l.published);
            return (
              <Link key={l.id} href={`/listings/${l.id}`} className="group">
                <Card className="flex items-center gap-4 p-3 transition-shadow hover:shadow-card">
                  <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                    {l.mainUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.mainUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <ImageOff className="size-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="min-w-0 truncate font-medium">{l.title}</p>
                      <Badge tone={st.tone} className="shrink-0">
                        {st.label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {l.category} · {formatPrice(l.price, l.currency)}
                    </p>
                  </div>
                  <div className="hidden items-center gap-4 sm:flex">
                    {l.errored && (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="size-3.5" /> chyba
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Globe className="size-4" />
                      {l.published}/{l.total}
                    </span>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
