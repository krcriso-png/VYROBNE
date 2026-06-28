import Link from "next/link";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-green-100 text-green-700",
  ARCHIVED: "bg-amber-100 text-amber-700",
};

// Listings overview with per-listing publication state.
export default async function ListingsPage() {
  const session = await auth();
  const listings = await prisma.listing.findMany({
    where: { userId: session!.user.id, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { publications: true } },
      publications: { select: { status: true } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inzeráty</h1>
        <Link
          href="/listings/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          + Nový inzerát
        </Link>
      </div>

      {listings.length === 0 ? (
        <p className="mt-10 text-center text-muted-foreground">
          Zatiaľ nemáš žiadne inzeráty. Vytvor svoj prvý.
        </p>
      ) : (
        <ul className="mt-6 divide-y rounded-xl border bg-card">
          {listings.map((l) => {
            const published = l.publications.filter(
              (p) => p.status === "PUBLISHED",
            ).length;
            const errored = l.publications.some((p) => p.status === "ERROR");
            return (
              <li key={l.id}>
                <Link
                  href={`/listings/${l.id}`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{l.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {l.category}
                      {l.price ? ` · ${l.price} ${l.currency}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {errored && <span title="Chyba">🔴</span>}
                    <span className="text-muted-foreground">
                      {published}/{l._count.publications} portálov
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_BADGE[l.status]
                      }`}
                    >
                      {l.status}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
