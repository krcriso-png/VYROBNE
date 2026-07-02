import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Clock, AlertTriangle, LifeBuoy, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { classifyError } from "@/lib/errors";
import { AdminPlanSelect } from "@/components/AdminPlanSelect";
import { AdminPortalToggle } from "@/components/AdminPortalToggle";
import { AdminIncidents, type IncidentDTO } from "@/components/AdminIncidents";

// Admin panel: users, subscriptions, queue health, recent errors, portals.
// User-reported problems are NOT here — they live as tickets in "Podpora"
// (summarised above with a link), so there's a single place to handle them.
export default async function AdminPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");

  const [
    users,
    errorCount,
    pendingCount,
    portals,
    errorLogs,
    openTicketCount,
    openTickets,
  ] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { subscription: true, _count: { select: { listings: true } } },
    }),
    prisma.publication.count({ where: { status: "ERROR" } }),
    prisma.publication.count({
      where: { status: { in: ["PENDING", "PUBLISHING", "UPDATING"] } },
    }),
    prisma.portal.findMany({ orderBy: { name: "asc" } }),
    // Error HISTORY from the activity log — persists even after a re-publish
    // (which clears the publication's lastError), so incidents don't vanish.
    prisma.activityLog.findMany({
      where: { level: "ERROR", listingId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
    // Support tickets still open (unresolved).
    prisma.supportThread.count({ where: { status: "OPEN" } }),
    prisma.supportThread.findMany({
      where: { status: "OPEN" },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: {
        user: { select: { email: true } },
        _count: { select: { messages: true } },
      },
    }),
  ]);

  // Keep the latest error per listing+portal (so a repeatedly-failing ad shows
  // once), newest first, capped at 20 — they stay until a newer run replaces
  // them, regardless of the live publication status.
  const seen = new Set<string>();
  const distinctErrors = errorLogs
    .filter((l) => {
      const key = `${l.listingId}|${l.portalKey ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);

  const listingIds = [...new Set(distinctErrors.map((l) => l.listingId!))];
  const [incidentListings, incidentPubs, shotLogs] = listingIds.length
    ? await Promise.all([
        prisma.listing.findMany({
          where: { id: { in: listingIds } },
          select: { id: true, title: true, user: { select: { email: true } } },
        }),
        prisma.publication.findMany({
          where: { listingId: { in: listingIds } },
          select: {
            id: true,
            status: true,
            listingId: true,
            portal: { select: { key: true } },
          },
        }),
        prisma.activityLog.findMany({
          where: { listingId: { in: listingIds } },
          orderBy: { createdAt: "desc" },
          take: 400,
        }),
      ])
    : [[], [], []];

  const portalName = (key: string | null) =>
    portals.find((p) => p.key === key)?.name ?? key ?? "—";
  const screenshotFor = (listingId: string, portalKey: string | null) => {
    const log = shotLogs.find((l) => {
      const m = l.meta as Record<string, unknown> | null;
      return (
        l.listingId === listingId &&
        l.portalKey === portalKey &&
        m &&
        typeof m === "object" &&
        m.debugScreenshot
      );
    });
    return log
      ? String((log.meta as Record<string, unknown>).debugScreenshot)
      : undefined;
  };

  const incidents: IncidentDTO[] = distinctErrors.map((l) => {
    const listing = incidentListings.find((x) => x.id === l.listingId);
    const pub = incidentPubs.find(
      (p) => p.listingId === l.listingId && p.portal.key === l.portalKey,
    );
    return {
      id: pub?.id ?? "",
      listingId: l.listingId!,
      portalKey: l.portalKey ?? null,
      listingTitle: listing?.title ?? "Inzerát",
      userEmail: listing?.user.email ?? "—",
      portalName: portalName(l.portalKey),
      error: classifyError(l.message).message,
      screenshot: screenshotFor(l.listingId!, l.portalKey),
      status: pub?.status,
      createdAt: l.createdAt.toISOString(),
    };
  });

  const stats = [
    { label: "Nevyriešené tickety", value: openTicketCount, icon: LifeBuoy, tone: openTicketCount > 0 ? "bg-warning/15 text-warning" : "bg-success/15 text-success" },
    { label: "Používatelia", value: users.length, icon: Users, tone: "bg-primary/10 text-primary" },
    { label: "Fronta (čaká)", value: pendingCount, icon: Clock, tone: "bg-warning/15 text-warning" },
    { label: "Chyby publikácií", value: errorCount, icon: AlertTriangle, tone: "bg-destructive/10 text-destructive" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Prehľad používateľov, fronty a portálov.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className={`grid size-10 place-items-center rounded-lg ${s.tone}`}>
              <s.icon className="size-5" />
            </div>
            <p className="mt-4 text-3xl font-bold tabular-nums">{s.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">
            Tickety podpory
            {openTicketCount > 0 && (
              <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                {openTicketCount} nevyriešených
              </span>
            )}
          </h2>
          <Link
            href="/podpora"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Spravovať všetky <ArrowRight className="size-4" />
          </Link>
        </div>
        {openTickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Žiadne otvorené tickety. 🎉
          </p>
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

      <section>
        <h2 className="mb-1 font-semibold">Portály</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Ak portál dočasne nefunguje pre ľudí, pozastav ho pre zákazníkov —
          skryje sa im, ale tebe (adminovi) zostane funkčný na testovanie.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {portals
            .filter((p) => p.key !== "mock")
            .map((p) => (
              <AdminPortalToggle
                key={p.id}
                portalKey={p.key}
                name={p.name}
                integration={p.integration}
                enabled={p.enabled}
                paused={p.pausedForUsers}
              />
            ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Používatelia</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Plán</th>
                <th className="px-4 py-2.5 font-medium">Inzeráty</th>
                <th className="px-4 py-2.5 font-medium">Stav</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <AdminPlanSelect
                      userId={u.id}
                      plan={u.subscription?.plan ?? "FREE"}
                    />
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{u._count.listings}</td>
                  <td className="px-4 py-2.5">
                    {u.blocked ? (
                      <Badge tone="destructive">blokovaný</Badge>
                    ) : (
                      <Badge tone="success">aktívny</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="mb-1 font-semibold">Chyby publikovania</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Automaticky zachytené zlyhania — zákazník ich nemusí nahlasovať. Po
          oprave spusti „Publikovať znova" a over stav, prípadne napíš
          zákazníkovi.
        </p>
        <AdminIncidents incidents={incidents} />
      </section>

    </div>
  );
}
