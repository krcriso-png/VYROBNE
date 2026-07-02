import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Clock, AlertTriangle, LifeBuoy, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminPlanSelect } from "@/components/AdminPlanSelect";
import { AdminPortalToggle } from "@/components/AdminPortalToggle";

// Admin panel = OVERVIEW only: stats, users, portals. All support work (user
// tickets + auto-captured errors) is handled in one place: the "Podpora" hub.
export default async function AdminPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");

  const [users, errorCount, pendingCount, portals, openTicketCount] =
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

      {/* Everything support-related lives in the Podpora hub. */}
      <Link href="/podpora" className="block">
        <Card className="flex items-center gap-4 p-5 transition-colors hover:bg-muted/40">
          <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning">
            <LifeBuoy className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Podpora a chyby</p>
            <p className="text-sm text-muted-foreground">
              {openTicketCount > 0
                ? `${openTicketCount} otvorených ticketov · `
                : "Žiadne otvorené tickety · "}
              rieš tickety od zákazníkov aj automaticky zachytené chyby na
              jednom mieste.
            </p>
          </div>
          <ArrowRight className="size-5 shrink-0 text-muted-foreground" />
        </Card>
      </Link>

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
