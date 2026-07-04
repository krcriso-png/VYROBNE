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
  const [portals, errorLogs, errorPubs] = await Promise.all([
    prisma.portal.findMany({ select: { key: true, name: true } }),
    prisma.activityLog.findMany({
      where: { level: "ERROR", listingId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
    // Every currently-ERROR publication — so the incident list matches the
    // "Chyby publikácií" count and each one is clearable (nothing stuck).
    prisma.publication.findMany({
      where: { status: "ERROR" },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        listingId: true,
        lastError: true,
        updatedAt: true,
        portal: { select: { key: true, name: true } },
        listing: {
          select: { id: true, title: true, user: { select: { email: true } } },
        },
      },
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

  const fromLogs: IncidentDTO[] = distinct.map((l) => {
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
      rawError: l.message?.trim() || undefined,
      screenshot: screenshotFor(l.listingId!, l.portalKey),
      status: pub?.status,
      createdAt: l.createdAt.toISOString(),
    };
  });

  // Append any currently-ERROR publication that the logs didn't already surface,
  // so the incident list covers every counted error and each can be resolved.
  const seenKeys = new Set(
    fromLogs.map((i) => `${i.listingId}|${i.portalKey ?? ""}`),
  );
  const fromPubs: IncidentDTO[] = errorPubs
    .filter((p) => !seenKeys.has(`${p.listingId}|${p.portal.key}`))
    .map((p) => ({
      id: p.id,
      listingId: p.listingId,
      portalKey: p.portal.key,
      listingTitle: p.listing.title,
      userEmail: p.listing.user.email ?? "—",
      portalName: p.portal.name,
      error: classifyError(p.lastError).message,
      rawError: p.lastError?.trim() || undefined,
      status: "ERROR",
      createdAt: p.updatedAt.toISOString(),
    }));

  return [...fromLogs, ...fromPubs];
}
