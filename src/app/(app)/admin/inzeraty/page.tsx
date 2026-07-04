import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Search, ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { displayListingStatus } from "@/lib/status";
import { scanListing } from "@/lib/moderation";
import {
  AdminListingCard,
  type AdminListingCardData,
} from "@/components/AdminListingCard";

// Admin moderation view: browse EVERY customer's listings, with an automatic
// scanner that flags likely-forbidden content (sex services, drugs, meds,
// weapons, fakes) for review. Remove any that break the rules — the owner is
// e-mailed the reason and the ad is taken down from the portals.
export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; flagged?: string }>;
}) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");

  const { q, flagged } = await searchParams;
  const query = (q ?? "").trim();
  const onlyFlagged = flagged === "1";

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
    take: 300,
    include: {
      user: { select: { email: true } },
      images: { where: { isMain: true }, take: 1 },
      publications: { include: { portal: { select: { name: true } } } },
    },
  });

  // Scan every listing for forbidden content.
  const scanned = listings.map((l) => {
    const flags = scanListing({
      title: l.title,
      description: l.description,
      category: l.category,
    });
    const published = l.publications.filter((p) => p.status === "PUBLISHED");
    const state = displayListingStatus(l.status, published.length);
    const data: AdminListingCardData = {
      id: l.id,
      title: l.title,
      description: l.description,
      price: l.price != null ? l.price.toString() : null,
      currency: l.currency,
      category: l.category,
      statusLabel: state.label,
      statusTone: state.tone,
      ownerEmail: l.user.email,
      mainUrl: l.images[0]?.url ?? null,
      portals: published.map((p) => ({
        id: p.id,
        name: p.portal.name,
        url: p.remoteUrl,
      })),
      flags,
    };
    return data;
  });

  const flaggedCount = scanned.filter((s) => s.flags.length > 0).length;
  const shown = onlyFlagged ? scanned.filter((s) => s.flags.length > 0) : scanned;

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
          Prehľad všetkých aktívnych inzerátov. Klikado automaticky označí tie,
          ktoré môžu porušovať pravidlá — skontroluj ich a prípadne odstráň
          (stiahne sa z portálov a zákazník dostane e-mail s dôvodom).
        </p>
      </div>

      {/* Suspicious-content summary + toggle. */}
      <Card
        className={
          "flex flex-wrap items-center justify-between gap-3 p-4 " +
          (flaggedCount > 0 ? "border-destructive/40 bg-destructive/[0.03]" : "")
        }
      >
        <div className="flex items-center gap-3">
          <div
            className={
              "grid size-10 shrink-0 place-items-center rounded-lg " +
              (flaggedCount > 0
                ? "bg-destructive/10 text-destructive"
                : "bg-success/12 text-success")
            }
          >
            <ShieldAlert className="size-5" />
          </div>
          <div>
            <p className="font-medium">
              {flaggedCount > 0
                ? `${flaggedCount} podozrivých inzerátov na kontrolu`
                : "Žiadny podozrivý inzerát"}
            </p>
            <p className="text-xs text-muted-foreground">
              Automatická kontrola: sexuálne služby, drogy, lieky/doping,
              zbrane, napodobeniny. Je to len upozornenie — rozhoduješ ty.
            </p>
          </div>
        </div>
        {flaggedCount > 0 && (
          <Link
            href={
              onlyFlagged
                ? `/admin/inzeraty${query ? `?q=${encodeURIComponent(query)}` : ""}`
                : `/admin/inzeraty?flagged=1${query ? `&q=${encodeURIComponent(query)}` : ""}`
            }
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            {onlyFlagged ? "Zobraziť všetky" : "Zobraziť len podozrivé"}
          </Link>
        )}
      </Card>

      <form className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          defaultValue={query}
          placeholder="Hľadať podľa názvu alebo e-mailu zákazníka…"
          className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {onlyFlagged && <input type="hidden" name="flagged" value="1" />}
      </form>

      {shown.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          {onlyFlagged
            ? "Žiadny podozrivý inzerát."
            : query
              ? `Pre „${query}" sa nenašiel žiadny inzerát.`
              : "Zatiaľ tu nie sú žiadne inzeráty."}
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((data) => (
            <AdminListingCard key={data.id} data={data} />
          ))}
        </div>
      )}
    </div>
  );
}
