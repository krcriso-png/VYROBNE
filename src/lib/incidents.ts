import { prisma } from "./db";
import { classifyError } from "./errors";
import type { IncidentDTO } from "@/components/AdminIncidents";

// ===========================================================================
// Auto-captured incidents (publishing errors) for the admin support hub.
//
// Sourced from the activity log (level ERROR) so incidents persist even after a
// re-publish clears the publication's lastError. Deduped per listing+portal,
// newest first, capped at 20.
// ===========================================================================

export async function loadIncidents(): Promise<IncidentDTO[]> {
  const [portals, errorLogs] = await Promise.all([
    prisma.portal.findMany({ select: { key: true, name: true } }),
    prisma.activityLog.findMany({
      where: { level: "ERROR", listingId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
  ]);

  const seen = new Set<string>();
  const distinct = errorLogs
    .filter((l) => {
      const key = `${l.listingId}|${l.portalKey ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);

  const listingIds = [...new Set(distinct.map((l) => l.listingId!))];
  const [listings, pubs, shotLogs] = listingIds.length
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

  return distinct.map((l) => {
    const listing = listings.find((x) => x.id === l.listingId);
    const pub = pubs.find(
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
}
