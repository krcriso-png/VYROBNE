import { redirect } from "next/navigation";
import { Users, Clock, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

// Admin panel: users, subscriptions, queue health, recent errors, portals.
export default async function AdminPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");

  const [users, errorCount, pendingCount, portals, recentErrors, reports] =
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
    ]);

  const stats = [
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

      <div className="grid gap-4 sm:grid-cols-3">
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
                    <Badge tone="neutral">{u.subscription?.plan ?? "FREE"}</Badge>
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
            {reports.map((r) => (
              <div key={r.id} className="p-3 text-sm">
                <p className="font-medium">{r.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                  {r.body}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(r.createdAt)}
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
