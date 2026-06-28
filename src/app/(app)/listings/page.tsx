import Link from "next/link";
import { Plus, ImageOff, Globe, AlertTriangle, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LISTING_STATUS } from "@/lib/status";
import { formatPrice } from "@/lib/utils";

// Listings overview with per-listing publication state.
export default async function ListingsPage() {
  const session = await auth();
  const listings = await prisma.listing.findMany({
    where: { userId: session!.user.id, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    include: {
      images: { where: { isMain: true }, take: 1 },
      _count: { select: { publications: true } },
      publications: { select: { status: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inzeráty</h1>
          <p className="text-sm text-muted-foreground">
            {listings.length} {listings.length === 1 ? "inzerát" : "inzerátov"}
          </p>
        </div>
        <Link href="/listings/new">
          <Button>
            <Plus className="size-4" /> Nový inzerát
          </Button>
        </Link>
      </div>

      {listings.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-16 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
            <Plus className="size-7" />
          </div>
          <div>
            <p className="font-medium">Zatiaľ nemáš žiadne inzeráty</p>
            <p className="text-sm text-muted-foreground">
              Vytvor svoj prvý inzerát a publikuj ho na všetky portály.
            </p>
          </div>
          <Link href="/listings/new">
            <Button className="mt-2">Vytvoriť inzerát</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-3">
          {listings.map((l) => {
            const main = l.images[0];
            const published = l.publications.filter(
              (p) => p.status === "PUBLISHED",
            ).length;
            const errored = l.publications.some((p) => p.status === "ERROR");
            const st = LISTING_STATUS[l.status];
            return (
              <Link key={l.id} href={`/listings/${l.id}`} className="group">
                <Card className="flex items-center gap-4 p-3 transition-shadow hover:shadow-card">
                  <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                    {main ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={main.url}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <ImageOff className="size-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{l.title}</p>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {l.category} · {formatPrice(l.price?.toString(), l.currency)}
                    </p>
                  </div>
                  <div className="hidden items-center gap-4 sm:flex">
                    {errored && (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="size-3.5" /> chyba
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Globe className="size-4" />
                      {published}/{l._count.publications}
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
