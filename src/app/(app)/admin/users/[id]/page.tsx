import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  Coins,
  ShieldAlert,
  LifeBuoy,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminUserBlock } from "@/components/AdminUserBlock";
import { AdminPlanSelect } from "@/components/AdminPlanSelect";
import { displayListingStatus } from "@/lib/status";
import { scanListing } from "@/lib/moderation";
import {
  AdminListingCard,
  type AdminListingCardData,
} from "@/components/AdminListingCard";

const PLAN_LABEL: Record<string, string> = {
  FREE: "Free",
  BASIC: "Štart",
  PRO: "Pro",
};

// Full admin detail of one customer: profile, plan, block control and every
// listing they have (with the forbidden-content scanner applied).
export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      subscription: true,
      _count: { select: { supportThreads: true } },
    },
  });
  if (!user) notFound();

  const listings = await prisma.listing.findMany({
    where: { userId: id, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    include: {
      images: { where: { isMain: true }, take: 1 },
      publications: { include: { portal: { select: { name: true } } } },
    },
  });

  const scanned: AdminListingCardData[] = listings.map((l) => {
    const flags = scanListing({
      title: l.title,
      description: l.description,
      category: l.category,
    });
    const published = l.publications.filter((p) => p.status === "PUBLISHED");
    const state = displayListingStatus(l.status, published.length);
    return {
      id: l.id,
      title: l.title,
      description: l.description,
      price: l.price != null ? l.price.toString() : null,
      currency: l.currency,
      category: l.category,
      statusLabel: state.label,
      statusTone: state.tone,
      mainUrl: l.images[0]?.url ?? null,
      portals: published.map((p) => ({
        id: p.id,
        name: p.portal.name,
        url: p.remoteUrl,
      })),
      flags,
    };
  });

  const flaggedCount = scanned.filter((s) => s.flags.length > 0).length;
  const joined = new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(user.createdAt);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/inzeraty"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Späť na inzeráty
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {user.name ?? user.email}
          </h1>
          {user.blocked ? (
            <Badge tone="destructive">blokovaný</Badge>
          ) : (
            <Badge tone="success">aktívny</Badge>
          )}
          {user.role === "ADMIN" && <Badge tone="primary">administrátor</Badge>}
        </div>
      </div>

      {/* Profile + account controls. */}
      <Card className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            <span className="break-all">{user.email}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Phone className="size-4 shrink-0 text-muted-foreground" />
            <span>{user.phone ?? "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="size-4 shrink-0 text-muted-foreground" />
            <span>Registrácia: {joined}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Coins className="size-4 shrink-0 text-muted-foreground" />
            <span>
              Plán {PLAN_LABEL[user.subscription?.plan ?? "FREE"]} ·{" "}
              {user.subscription?.plan === "PRO"
                ? "∞ kreditov"
                : `${user.subscription?.credits ?? 0} kreditov`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <LifeBuoy className="size-4 shrink-0 text-muted-foreground" />
            <span>{user._count.supportThreads} podnetov v podpore</span>
          </div>
        </div>

        {user.role !== "ADMIN" && (
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <span className="text-sm text-muted-foreground">Plán:</span>
            <AdminPlanSelect
              userId={user.id}
              plan={user.subscription?.plan ?? "FREE"}
            />
            <div className="ml-auto">
              <AdminUserBlock
                userId={user.id}
                blocked={user.blocked}
                email={user.email}
              />
            </div>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          Inzeráty ({scanned.length})
        </h2>
        {flaggedCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
            <ShieldAlert className="size-3.5" /> {flaggedCount} podozrivých
          </span>
        )}
      </div>

      {scanned.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Tento používateľ nemá žiadne aktívne inzeráty.
        </Card>
      ) : (
        <div className="space-y-3">
          {scanned.map((data) => (
            <AdminListingCard key={data.id} data={data} />
          ))}
        </div>
      )}
    </div>
  );
}
