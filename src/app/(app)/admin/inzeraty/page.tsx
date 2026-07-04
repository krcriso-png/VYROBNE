import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Search, ExternalLink, ImageOff } from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { displayListingStatus } from "@/lib/status";
import { AdminListingRemove } from "@/components/AdminListingRemove";

// Admin moderation view: browse EVERY customer's listings and remove any that
// break the rules (owner is e-mailed the reason, ad is taken down from portals).
export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");

  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const listings = await prisma.listing.findMany({
    where: {
      status: { not: "ARCHIVED" },
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { user: { email: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      user: { select: { email: true } },
      images: { where: { isMain: true }, take: 1 },
      publications: {
        include: { portal: { select: { name: true } } },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Späť do Adminu
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Inzeráty zákazníkov</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prehľad všetkých aktívnych inzerátov. Ak niektorý porušuje pravidlá,
          môžeš ho odstrániť — stiahne sa z portálov a zákazník dostane e-mail s
          dôvodom.
        </p>
      </div>

      <form className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          defaultValue={query}
          placeholder="Hľadať podľa názvu alebo e-mailu zákazníka…"
          className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </form>

      {listings.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          {query
            ? `Pre „${query}" sa nenašiel žiadny inzerát.`
            : "Zatiaľ tu nie sú žiadne inzeráty."}
        </Card>
      ) : (
        <div className="space-y-3">
          {listings.map((l) => {
            const published = l.publications.filter(
              (p) => p.status === "PUBLISHED",
            );
            const state = displayListingStatus(l.status, published.length);
            return (
              <Card key={l.id} className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="size-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
                    {l.images[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.images[0].url}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="grid size-full place-items-center text-muted-foreground">
                        <ImageOff className="size-5" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{l.title}</p>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {l.user.email}
                      {l.price != null && (
                        <> · {l.price.toString()} {l.currency}</>
                      )}
                      {l.category && <> · {l.category}</>}
                    </p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {l.description}
                    </p>
                    {published.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {published.map((p) =>
                          p.remoteUrl ? (
                            <a
                              key={p.id}
                              href={p.remoteUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-primary hover:bg-primary/5"
                            >
                              <ExternalLink className="size-3" /> {p.portal.name}
                            </a>
                          ) : (
                            <span
                              key={p.id}
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground"
                            >
                              {p.portal.name}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 sm:w-64">
                    <AdminListingRemove listingId={l.id} title={l.title} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
