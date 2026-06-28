import Link from "next/link";
import {
  ListChecks,
  Globe,
  Clock,
  AlertTriangle,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

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
    {
      label: "Aktívne inzeráty",
      value: `${activeListings}${limit ? ` / ${limit}` : ""}`,
      icon: ListChecks,
      tone: "primary" as const,
    },
    {
      label: "Publikované portály",
      value: published,
      icon: Globe,
      tone: "success" as const,
    },
    {
      label: "Čaká na spracovanie",
      value: pending,
      icon: Clock,
      tone: "warning" as const,
    },
    {
      label: "Chyby",
      value: errors,
      icon: AlertTriangle,
      tone: "destructive" as const,
    },
  ];

  const toneBg: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-8">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="flex items-center justify-between">
              <div
                className={`grid size-10 place-items-center rounded-lg ${toneBg[c.tone]}`}
              >
                <c.icon className="size-5" />
              </div>
            </div>
            <p className="mt-4 text-3xl font-bold tabular-nums">{c.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{c.label}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="font-semibold">Posledné chyby</h2>
          <Link
            href="/listings"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Inzeráty <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
        {recentErrors.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-success/12 text-success">
              <ListChecks className="size-6" />
            </div>
            <p className="font-medium">Žiadne chyby</p>
            <p className="text-sm text-muted-foreground">
              Všetko beží hladko. 🎉
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {recentErrors.map((e) => (
              <li key={e.id} className="flex items-start gap-3 p-4">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <p className="truncate text-sm">{e.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.portalKey ?? "—"} · {formatDate(e.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
