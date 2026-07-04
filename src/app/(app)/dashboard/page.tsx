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
  AlertTriangle,
  LifeBuoy,
  Users,
  Clock,
  ShieldCheck,
  FlaskConical,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { getCreditState } from "@/lib/credits";
import { Card } from "@/components/ui/card";
import { Badge, Dot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PUBLICATION_STATUS, displayListingStatus } from "@/lib/status";
import { formatPrice, formatDate } from "@/lib/utils";
import { AutoTopToggle } from "@/components/AutoTopToggle";
import { AutoRefresh } from "@/components/AutoRefresh";
import { renewLabel } from "@/lib/renew";


// Customer-friendly home: greeting, key numbers, and a clean overview of the
// user's listings with their publishing status. No technical error logs here.
export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  // The admin account gets an administration overview here instead of the
  // customer widgets (they still have "Inzeráty" to test publishing).
  if (session!.user.role === "ADMIN") {
    return <AdminHome name={session!.user.name ?? null} />;
  }

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
              const publishedCount = l.publications.filter(
                (p) => p.status === "PUBLISHED",
              ).length;
              const st = displayListingStatus(l.status, publishedCount);
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
                <Card key={l.id} className="flex min-w-0 items-center gap-4 p-3">
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
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        href={`/listings/${l.id}`}
                        className="min-w-0 truncate font-medium hover:underline"
                      >
                        {l.title}
                      </Link>
                      <Badge tone={st.tone} className="shrink-0">
                        {st.label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {l.category} ·{" "}
                      {formatPrice(l.price?.toString(), l.currency)}
                      {l.renewIntervalHours
                        ? ` · auto-topovať ${renewLabel(l.renewIntervalHours).toLowerCase()}`
                        : ""}
                    </p>
                    {/* Per-portal status chips */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {l.publications.map((p) => {
                        const ps = PUBLICATION_STATUS[p.status];
                        return (
                          <Badge
                            key={p.id}
                            tone={p.statusNote ? "warning" : ps.tone}
                            title={p.statusNote ?? undefined}
                          >
                            <Dot tone={p.statusNote ? "warning" : ps.tone} />{" "}
                            {p.portal.name}
                            {p.statusNote ? " · neoverené" : ""}
                          </Badge>
                        );
                      })}
                      {l.publications.length === 0 && (
                        <span className="text-xs text-muted-foreground">
                          Zatiaľ nepublikované
                        </span>
                      )}
                    </div>
                    {l.publications.some((p) => p.statusNote) && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-warning">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        Stav inzerátu sa nepodarilo overiť — skontroluj
                        prihlásenie k Bazoš účtu v sekcii Portály.
                      </p>
                    )}
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

// Admin-focused home: the administration overview (tickets, users, queue,
// errors) + quick links — not customer metrics. Listings stay reachable for
// testing via the quick link and the sidebar.
async function AdminHome({ name }: { name: string | null }) {
  const [openTicketCount, userCount, pendingCount, errorCount, openTickets] =
    await Promise.all([
      prisma.supportThread.count({ where: { status: "OPEN" } }),
      prisma.user.count(),
      prisma.publication.count({
        where: { status: { in: ["PENDING", "PUBLISHING", "UPDATING"] } },
      }),
      prisma.publication.count({ where: { status: "ERROR" } }),
      prisma.supportThread.findMany({
        where: { status: "OPEN" },
        orderBy: { updatedAt: "desc" },
        take: 6,
        include: {
          user: { select: { email: true } },
          _count: { select: { messages: true } },
        },
      }),
    ]);

  const stats = [
    {
      label: "Nevyriešené tickety",
      value: openTicketCount,
      icon: LifeBuoy,
      tone:
        openTicketCount > 0
          ? "bg-warning/15 text-warning"
          : "bg-success/15 text-success",
    },
    { label: "Používatelia", value: userCount, icon: Users, tone: "bg-primary/10 text-primary" },
    { label: "Fronta (čaká)", value: pendingCount, icon: Clock, tone: "bg-warning/15 text-warning" },
    { label: "Chyby publikácií", value: errorCount, icon: AlertTriangle, tone: "bg-destructive/10 text-destructive" },
  ];

  const links = [
    { href: "/admin", label: "Admin panel", desc: "Používatelia, plány, portály, chyby", icon: ShieldCheck },
    { href: "/podpora", label: "Tickety podpory", desc: "Odpovedaj a rieš podnety zákazníkov", icon: LifeBuoy },
    { href: "/listings", label: "Testovacie inzeráty", desc: "Vytvor a otestuj publikovanie", icon: FlaskConical },
  ];

  return (
    <div className="space-y-8">
      <AutoRefresh intervalMs={45_000} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin prehľad</h1>
          <p className="text-sm text-muted-foreground">
            Vitaj späť{name ? `, ${name}` : ""}. Tu je stav celej platformy.
          </p>
        </div>
        <Badge tone="primary">Administrátor</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className={`grid size-10 place-items-center rounded-lg ${s.tone}`}>
              <s.icon className="size-5" />
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums">{s.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:bg-muted/50">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <l.icon className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-1 font-medium">
                  {l.label} <ArrowRight className="size-3.5" />
                </p>
                <p className="text-xs text-muted-foreground">{l.desc}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">
            Otvorené tickety
            {openTicketCount > 0 && (
              <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                {openTicketCount}
              </span>
            )}
          </h2>
          <Link
            href="/podpora"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Všetky <ArrowRight className="size-3.5" />
          </Link>
        </div>
        {openTickets.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Žiadne otvorené tickety. 🎉
          </Card>
        ) : (
          <Card className="divide-y">
            {openTickets.map((t) => (
              <Link
                key={t.id}
                href="/podpora"
                className="flex items-center gap-3 p-3 text-sm transition-colors hover:bg-muted/50"
              >
                <LifeBuoy className="size-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.subject}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.user.email} · {t._count.messages} správ ·{" "}
                    {formatDate(t.updatedAt)}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
