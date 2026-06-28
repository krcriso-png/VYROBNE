import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// Admin panel: users, subscriptions, queue health, recent errors, portals.
// Restricted to ADMIN role (also enforced by middleware on /admin).
export default async function AdminPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");

  const [users, errorCount, pendingCount, portals, recentErrors] =
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
    ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <h1 className="text-2xl font-bold">Admin</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Používatelia" value={users.length} />
        <Stat label="Fronta (čaká)" value={pendingCount} />
        <Stat label="Chyby publikácií" value={errorCount} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Portály</h2>
        <div className="flex flex-wrap gap-2">
          {portals.map((p) => (
            <span
              key={p.id}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                p.enabled
                  ? "bg-green-100 text-green-700"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {p.name} · {p.integration} {p.enabled ? "✓" : "—"}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Používatelia</h2>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Plán</th>
                <th className="px-4 py-2">Inzeráty</th>
                <th className="px-4 py-2">Stav</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{u.subscription?.plan ?? "FREE"}</td>
                  <td className="px-4 py-2">{u._count.listings}</td>
                  <td className="px-4 py-2">
                    {u.blocked ? "🔴 blokovaný" : "🟢 aktívny"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Posledné chyby</h2>
        <ul className="space-y-1 text-sm">
          {recentErrors.map((e) => (
            <li key={e.id} className="text-muted-foreground">
              {e.createdAt.toLocaleString("sk-SK")} · {e.portalKey ?? "—"} ·{" "}
              {e.message}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}
