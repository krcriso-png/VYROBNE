import { prisma } from "@/lib/db";
import { route, json, requireUser } from "@/lib/api";

// GET /api/dashboard — summary metrics for the dashboard:
// active listings, published portals, sync state, recent errors, stats.
export const GET = route(async () => {
  const user = await requireUser();

  const [activeListings, publishedCount, pending, errors, recentLogs, sub] =
    await Promise.all([
      prisma.listing.count({
        where: { userId: user.id, status: "ACTIVE" },
      }),
      prisma.publication.count({
        where: { listing: { userId: user.id }, status: "PUBLISHED" },
      }),
      prisma.publication.count({
        where: {
          listing: { userId: user.id },
          status: { in: ["PENDING", "PUBLISHING", "UPDATING"] },
        },
      }),
      prisma.publication.count({
        where: { listing: { userId: user.id }, status: "ERROR" },
      }),
      prisma.activityLog.findMany({
        where: { userId: user.id, level: "ERROR" },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.subscription.findUnique({ where: { userId: user.id } }),
    ]);

  return json({
    stats: {
      activeListings,
      publishedCount,
      pending,
      errors,
    },
    plan: sub?.plan ?? "FREE",
    subscriptionStatus: sub?.status ?? "ACTIVE",
    recentErrors: recentLogs.map((l) => ({
      message: l.message,
      portalKey: l.portalKey,
      createdAt: l.createdAt,
    })),
  });
});
