import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PLANS } from "@/lib/plans";

// Dashboard: active listings, published portals, sync state, recent errors.
export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [activeListings, published, pending, errors, recentErrors, sub] =
    await Promise.all([
      prisma.listing.count({ where: { userId, status: "ACTIVE" } }),
      prisma.publication.count({
        where: { listing: { userId }, status: "PUBLISHED" },
      }),
      prisma.publication.count({
        where: {
          listing: { userId },
          status: { in: ["PENDING", "PUBLISHING", "UPDATING"] },
        },
      }),
      prisma.publication.count({
        where: { listing: { userId }, status: "ERROR" },
      }),
      prisma.activityLog.findMany({
        where: { userId, level: "ERROR" },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.subscription.findUnique({ where: { userId } }),
    ]);

  const plan = sub?.plan ?? "FREE";
  const limit = PLANS[plan].maxActiveListings;

  const cards = [
    { label: "Aktívne inzeráty", value: `${activeListings}${limit ? ` / ${limit}` : ""}` },
    { label: "Publikované (portály)", value: published },
    { label: "Čaká na spracovanie", value: pending },
    { label: "Chyby", value: errors },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Prehľad</h1>
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
          Plán: {PLANS[plan].name}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-3xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-8 rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Posledné chyby</h2>
        {recentErrors.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Žiadne chyby. Všetko beží hladko. 🎉
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recentErrors.map((e) => (
              <li key={e.id} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 text-destructive">🔴</span>
                <div>
                  <p>{e.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.portalKey ?? "—"} · {e.createdAt.toLocaleString("sk-SK")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
