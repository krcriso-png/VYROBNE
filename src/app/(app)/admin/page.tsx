import { redirect } from "next/navigation";
import { Users, Clock, AlertTriangle, LifeBuoy } from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminPlanSelect } from "@/components/AdminPlanSelect";
import { AdminPortalToggle } from "@/components/AdminPortalToggle";
import { AdminIncidents } from "@/components/AdminIncidents";
import { SupportThreads, type SupportThreadDTO } from "@/components/SupportThreads";
import { loadIncidents } from "@/lib/incidents";

// Admin panel = the single place for everything admin: stats, all support
// (customer tickets + auto-captured errors), portals and users.
export default async function AdminPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");

  const [users, errorCount, pendingCount, portals, openTicketCount, threads, incidents] =
    await Promise.all([
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
      prisma.supportThread.count({ where: { status: "OPEN" } }),
      prisma.supportThread.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          user: { select: { email: true } },
          messages: { orderBy: { createdAt: "asc" } },
        },
      }),
      loadIncidents(),
    ]);

  // Opening the panel clears the admin's "unread ticket" flag (drives the nav).
  await prisma.supportThread.updateMany({
    where: { adminUnread: true },
    data: { adminUnread: false },
  });

  // For tickets linked to a listing, resolve the current portal status so a fix
  // can be verified straight from the ticket.
  const statusByThread = new Map<string, string>();
  const titleByListing = new Map<string, string>();
  const linked = threads.filter((t) => t.listingId);
  const listingIds = [...new Set(linked.map((t) => t.listingId!))];
  if (listingIds.length) {
    const [listings, pubs] = await Promise.all([
      prisma.listing.findMany({
        where: { id: { in: listingIds } },
        select: { id: true, title: true },
      }),
      prisma.publication.findMany({
        where: { listingId: { in: listingIds } },
        select: { listingId: true, status: true, portal: { select: { key: true } } },
      }),
    ]);
    for (const l of listings) titleByListing.set(l.id, l.title);
    for (const t of linked) {
      const p = pubs.find(
        (p) => p.listingId === t.listingId && p.portal.key === t.portalKey,
      );
      if (p) statusByThread.set(t.id, p.status);
    }
  }

  const ticketDtos: SupportThreadDTO[] = threads.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    userEmail: t.user.email,
    listingId: t.listingId ?? undefined,
    portalKey: t.portalKey ?? undefined,
    listingTitle: t.listingId ? titleByListing.get(t.listingId) : undefined,
    portalStatus: statusByThread.get(t.id),
    createdAt: t.createdAt.toISOString(),
    messages: t.messages.map((m) => ({
      id: m.id,
      author: m.author,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  }));

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
          Podpora, používatelia, fronta a portály — všetko na jednom mieste.
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

      {/* Support: auto-captured errors (collapsed) + customer tickets. */}
      <section className="space-y-4">
        <h2 className="font-semibold">Podpora</h2>

        {incidents.length > 0 && (
          <details className="group overflow-hidden rounded-xl border bg-card">
            <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 font-medium">
                Automaticky zachytené chyby
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  {incidents.length}
                </span>
              </span>
              <span className="text-sm text-muted-foreground group-open:hidden">
                rozbaliť ▾
              </span>
              <span className="hidden text-sm text-muted-foreground group-open:inline">
                zbaliť ▴
              </span>
            </summary>
            <div className="border-t p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Zlyhania zachytené automaticky — zákazník ich nemusí nahlásiť.
                Po oprave spusti „Publikovať znova" a over stav, prípadne napíš
                zákazníkovi.
              </p>
              <AdminIncidents incidents={incidents} />
            </div>
          </details>
        )}

        <SupportThreads threads={ticketDtos} isAdmin />
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
    </div>
  );
}
