import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListingsBrowser, type BrowserListing } from "@/components/ListingsBrowser";

// Listings overview with search/filter and per-listing publication state.
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

  const rows: BrowserListing[] = listings.map((l) => ({
    id: l.id,
    title: l.title,
    category: l.category,
    price: l.price != null ? l.price.toString() : null,
    currency: l.currency,
    status: l.status,
    mainUrl: l.images[0]?.url ?? null,
    published: l.publications.filter((p) => p.status === "PUBLISHED").length,
    total: l._count.publications,
    errored: l.publications.some((p) => p.status === "ERROR"),
  }));

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
        <ListingsBrowser listings={rows} />
      )}
    </div>
  );
}
