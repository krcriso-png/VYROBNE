import Link from "next/link";
import {
  ListChecks,
  Globe,
  Plus,
  ImageOff,
  ArrowRight,
  ExternalLink,
  Coins,
  Eye,
  CalendarClock,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { getCreditState } from "@/lib/credits";
import { Card } from "@/components/ui/card";
import { Badge, Dot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LISTING_STATUS, PUBLICATION_STATUS } from "@/lib/status";
import { formatPrice } from "@/lib/utils";
import { AutoTopToggle } from "@/components/AutoTopToggle";
import { AutoRefresh } from "@/components/AutoRefresh";

const RENEW_LABEL: Record<number, string> = {
  24: "každých 24 h",
  48: "každých 48 h",
  168: "každý týždeň",
};

// Customer-friendly home: greeting, key numbers, and a clean overview of the
// user's listings with their publishing status. No technical error logs here.
export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [listings, published, sub, credit] = await Promise.all([
    prisma.listing.findMany({
      where: { userId, status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: {
        images: { where: { isMain: true }, take: 1 },
        publications: { include: { portal: { select: { name: true } } } },
      },
    }),
    prisma.publication.count({
      where: { listing: { userId }, status: "PUBLISHED" },
    }),
    prisma.subscription.findUnique({ where: { userId } }),
    getCreditState(userId),
  ]);

  const plan = sub?.plan ?? "FREE";
  const activeCount = listings.filter((l) => l.status === "ACTIVE").length;

  const cards = [
    {
      label: "Aktívne inzeráty",
      value: activeCount,
      icon: ListChecks,
      tone: "bg-primary/10 text-primary",
    },
    {
      label: "Publikované portály",
      value: published,
      icon: Globe,
      tone: "bg-success/12 text-success",
    },
    {
      label: "Zostatok kreditov",
      value: credit.unlimited ? "∞" : credit.credits,
      icon: Coins,
      tone: "bg-warning/12 text-warning",
    },
  ];

  return (
    <div className="space-y-8">
      <AutoRefresh intervalMs={45_000} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prehľad</h1>
          <p className="text-sm text-muted-foreground">
            Vitaj späť{session?.user.name ? `, ${session.user.name}` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="primary">Plán: {PLANS[plan].name}</Badge>
          <Link href="/listings/new">
            <Button size="sm">
              <Plus className="size-4" /> Nový inzerát
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className={`grid size-10 place-items-center rounded-lg ${c.tone}`}>
              <c.icon className="size-5" />
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums">{c.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{c.label}</p>
          </Card>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Tvoje inzeráty</h2>
          <Link
            href="/listings"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Všetky <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {listings.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Plus className="size-6" />
            </div>
            <p className="font-medium">Zatiaľ nemáš žiadne inzeráty</p>
            <Link href="/listings/new">
              <Button>Vytvoriť prvý inzerát</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-3">
            {listings.map((l) => {
              const main = l.images[0];
              const st = LISTING_STATUS[l.status];
              const publishedPub = l.publications.find(
                (p) => p.status === "PUBLISHED" && p.remoteUrl,
              );
              const totalViews = l.publications.reduce(
                (sum, p) => sum + p.viewsBase + p.viewsCurrent,
                0,
              );
              const liveDates = l.publications
                .filter((p) => p.status === "PUBLISHED" && p.publishedAt)
                .map((p) => p.publishedAt!.getTime());
              const adDate = liveDates.length
                ? new Date(Math.max(...liveDates))
                : null;
              return (
                <Card key={l.id} className="flex items-center gap-4 p-3">
                  <Link
                    href={`/listings/${l.id}`}
                    className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground"
                  >
                    {main ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={main.url} alt="" className="size-full object-cover" />
                    ) : (
                      <ImageOff className="size-5" />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/listings/${l.id}`}
                        className="truncate font-medium hover:underline"
                      >
                        {l.title}
                      </Link>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {l.category} ·{" "}
                      {formatPrice(l.price?.toString(), l.currency)}
                      {l.renewIntervalHours
                        ? ` · auto-topovať ${RENEW_LABEL[l.renewIntervalHours] ?? ""}`
                        : ""}
                    </p>
                    {/* Per-portal status chips */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {l.publications.map((p) => {
                        const ps = PUBLICATION_STATUS[p.status];
                        return (
                          <Badge key={p.id} tone={ps.tone}>
                            <Dot tone={ps.tone} /> {p.portal.name}
                          </Badge>
                        );
                      })}
                      {l.publications.length === 0 && (
                        <span className="text-xs text-muted-foreground">
                          Zatiaľ nepublikované
                        </span>
                      )}
                    </div>
                    {/* Live metrics: cumulative reach + current ad date */}
                    {(publishedPub || totalViews > 0) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Eye className="size-3.5" />
                          {totalViews} zhliadnutí spolu
                        </span>
                        {adDate && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="size-3.5" />
                            na portáli od {adDate.toLocaleDateString("sk-SK")}{" "}
                            {adDate.toLocaleTimeString("sk-SK", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="hidden items-center gap-2 sm:flex">
                    <AutoTopToggle
                      listingId={l.id}
                      initialOn={l.renewIntervalHours === 24}
                    />
                    {publishedPub?.remoteUrl && (
                      <a
                        href={publishedPub.remoteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                      >
                        Otvoriť <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
