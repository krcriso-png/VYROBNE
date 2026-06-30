import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  Users,
  Clock,
  AlertTriangle,
  ImageIcon,
  ExternalLink,
  LifeBuoy,
  ArrowRight,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { toPublicUrl } from "@/lib/url";
import { AdminPlanSelect } from "@/components/AdminPlanSelect";

// Admin panel: users, subscriptions, queue health, recent errors, portals.
export default async function AdminPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");

  // Public origin of this request, to repair any internal/localhost links
  // baked into older error reports.
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || "https";
  const origin = host ? `${proto}://${host}` : "";

  const [
    users,
    errorCount,
    pendingCount,
    portals,
    recentErrors,
    reports,
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
    prisma.activityLog.findMany({
      where: { level: "ERROR" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    // Error reports submitted by users ("Nahlásiť adminovi").
    prisma.notification.findMany({
      where: { userId: session.user.id, type: "SYSTEM" },
      orderBy: { createdAt: "desc" },
      take: 15,
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
        <h2 className="mb-3 font-semibold">Portály</h2>
        <div className="flex flex-wrap gap-2">
          {portals.map((p) => (
            <Badge key={p.id} tone={p.enabled ? "success" : "neutral"}>
              {p.name} · {p.integration} {p.enabled ? "✓" : "—"}
            </Badge>
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
        <h2 className="mb-3 font-semibold">Posledné chyby</h2>
        {recentErrors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Žiadne chyby.</p>
        ) : (
          <Card className="divide-y">
            {recentErrors.map((e) => (
              <div key={e.id} className="flex items-start gap-3 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div>
                  <p>{e.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.portalKey ?? "—"} · {formatDate(e.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Nahlásené chyby od používateľov</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">Žiadne nahlásenia.</p>
        ) : (
          <Card className="divide-y">
            {reports.map((r) => {
              const body = r.body ?? "";
              const shotRaw = body.match(
                /https?:\/\/\S+\/api\/blob\/\S+\.png/i,
              )?.[0];
              const listingRaw = body.match(
                /https?:\/\/\S+\/listings\/[A-Za-z0-9_-]+/i,
              )?.[0];
              const shot = shotRaw ? toPublicUrl(shotRaw, origin) : null;
              const listing = listingRaw
                ? toPublicUrl(listingRaw, origin)
                : null;
              return (
                <div key={r.id} className="p-3 text-sm">
                  <p className="font-medium">{r.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    {body}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {shot && (
                      <a
                        href={shot}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                      >
                        <ImageIcon className="size-3.5" /> Zobraziť screenshot
                      </a>
                    )}
                    {listing && (
                      <a
                        href={listing}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        <ExternalLink className="size-3.5" /> Otvoriť inzerát
                      </a>
                    )}
                  </div>
                  {shot && (
                    <a href={shot} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shot}
                        alt="Screenshot chyby"
                        className="mt-2 max-h-64 rounded-lg border object-contain"
                      />
                    </a>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(r.createdAt)}
                  </p>
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
