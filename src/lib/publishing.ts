import { prisma } from "./db";
import { enqueueTask } from "./queue";
import { getProvider } from "../providers/registry";
import { logActivity } from "./logger";

// ===========================================================================
// Publishing orchestration (producer side)
//
// Called by API routes when a user clicks "Publish" / edits a listing. It
// reconciles the desired set of portals into Publication rows and enqueues the
// appropriate jobs. The worker does the heavy lifting asynchronously.
// ===========================================================================

/**
 * Publish a listing to the given portal keys. Creates/links Publication rows
 * (using the user's saved account per portal) and enqueues publish jobs.
 * Portals the user previously published to but did not re-select are removed.
 */
export async function publishListing(
  userId: string,
  listingId: string,
  portalKeys: string[],
): Promise<void> {
  const listing = await prisma.listing.findFirstOrThrow({
    where: { id: listingId, userId },
  });

  // Admins may still publish to portals paused for customers (for testing);
  // regular users cannot.
  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  const isAdmin = owner?.role === "ADMIN";

  const portals = await prisma.portal.findMany({
    where: {
      key: { in: portalKeys },
      enabled: true,
      ...(isAdmin ? {} : { pausedForUsers: false }),
    },
  });

  for (const portal of portals) {
    const account = await prisma.portalAccount.findUnique({
      where: { userId_portalId: { userId, portalId: portal.id } },
    });
    if (!account) {
      await logActivity({
        level: "WARN",
        message: `Skipping ${portal.name}: no saved account`,
        userId,
        listingId,
        portalKey: portal.key,
      });
      continue;
    }

    const publication = await prisma.publication.upsert({
      where: { listingId_portalId: { listingId, portalId: portal.id } },
      create: {
        listingId,
        portalId: portal.id,
        portalAccountId: account.id,
        status: "PENDING",
      },
      update: { portalAccountId: account.id, status: "PENDING", lastError: null },
    });

    await enqueueTask(
      "publish",
      {
        publicationId: publication.id,
        userId,
        listingId,
        portalKey: portal.key,
      },
      // No auto-retry: a browser publish may trigger an SMS, and retrying would
      // re-send it. The user re-publishes manually if it fails.
      { attempts: 1 },
    );
  }

  // Ensure the listing is marked active once it has been sent out.
  if (listing.status === "DRAFT") {
    await prisma.listing.update({
      where: { id: listingId },
      data: { status: "ACTIVE" },
    });
  }
}

/**
 * Propagate a listing edit to every portal it is already live on
 * (price/description/photo/phone changes → update everywhere).
 */
export async function syncListing(
  userId: string,
  listingId: string,
): Promise<void> {
  const publications = await prisma.publication.findMany({
    where: {
      listingId,
      listing: { userId },
      status: { in: ["PUBLISHED", "ERROR"] },
    },
    include: { portal: true },
  });

  for (const pub of publications) {
    await enqueueTask("update", {
      publicationId: pub.id,
      userId,
      listingId,
      portalKey: pub.portal.key,
    });
  }
}

/** Remove a listing from a single portal (or all when portalId is omitted). */
export async function unpublishListing(
  userId: string,
  listingId: string,
  portalId?: string,
): Promise<void> {
  const publications = await prisma.publication.findMany({
    where: {
      listingId,
      listing: { userId },
      ...(portalId ? { portalId } : {}),
      status: { notIn: ["REMOVED"] },
    },
    include: { portal: true },
  });

  for (const pub of publications) {
    await enqueueTask("delete", {
      publicationId: pub.id,
      userId,
      listingId,
      portalKey: pub.portal.key,
    });
  }
}

/**
 * Manually "bump" (topovať) a listing now — enqueue a refresh for every portal
 * it's live on, staggered so portals aren't hammered. Returns how many queued.
 */
export async function refreshListing(
  userId: string,
  listingId: string,
): Promise<number> {
  const pubs = await prisma.publication.findMany({
    where: { listingId, listing: { userId }, status: "PUBLISHED" },
    include: { portal: true },
  });
  const STAGGER_MS = Number(process.env.REFRESH_STAGGER_MS ?? 90_000);
  let i = 0;
  for (const pub of pubs) {
    await enqueueTask(
      "refresh",
      { publicationId: pub.id, userId, listingId, portalKey: pub.portal.key },
      // No auto-retry: a repost deletes + re-posts (may trigger SMS); retrying
      // would re-attempt SMS and spam the user. Fail once, report clearly.
      { delayMs: i * STAGGER_MS, attempts: 1 },
    );
    i++;
  }
  return pubs.length;
}

/**
 * Manually enqueue a status check for every publication of a listing (except
 * ones already removed). Used by the "Skontrolovať stav" button so the user
 * doesn't have to wait for the periodic scheduler.
 */
export async function recheckListing(
  userId: string,
  listingId: string,
): Promise<number> {
  const pubs = await prisma.publication.findMany({
    where: {
      listingId,
      listing: { userId },
      // Include REMOVED too — those are exactly the ones the user wants to
      // re-verify. Skip only the in-flight ones.
      status: { in: ["PUBLISHED", "REMOVED", "ERROR"] },
    },
    include: { portal: true },
  });
  let i = 0;
  for (const pub of pubs) {
    await enqueueTask(
      "check_status",
      {
        publicationId: pub.id,
        userId,
        listingId,
        portalKey: pub.portal.key,
      },
      { delayMs: i * 4000 },
    );
    i++;
  }
  return pubs.length;
}

/**
 * Enqueue a status check for every live publication that hasn't been checked
 * recently. Keeps the view count + "is it still live" + current date fresh so
 * the dashboard reflects reality without the user doing anything. Staggered to
 * avoid hammering portals.
 */
export async function enqueueDueStatusChecks(
  maxAgeMs = Number(process.env.STATUS_CHECK_INTERVAL_MS ?? 60 * 60 * 1000),
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const due = await prisma.publication.findMany({
    where: {
      listing: { status: { not: "ARCHIVED" } },
      OR: [
        // PUBLISHED ads: re-check liveness/views on the normal cadence.
        {
          status: "PUBLISHED",
          remoteId: { not: null },
          OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lte: cutoff } }],
        },
        // REMOVED ads that still carry a remote id were flagged by a check (not
        // a user delete) — re-verify promptly so a wrongly-removed ad heals.
        { status: "REMOVED", remoteId: { not: null } },
        // ERROR ads: a publish can throw AFTER the ad actually went live (or on
        // an our-side glitch). Re-verify so a live ad heals to PUBLISHED; a
        // genuine failure stays ERROR (checkStatus only heals on confirmation).
        {
          status: "ERROR",
          OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lte: cutoff } }],
        },
      ],
    },
    include: { portal: true, listing: { select: { userId: true } } },
    take: 200,
  });

  const STAGGER_MS = Number(process.env.REFRESH_STAGGER_MS ?? 90_000);
  let i = 0;
  for (const pub of due) {
    await enqueueTask(
      "check_status",
      {
        publicationId: pub.id,
        userId: pub.listing.userId,
        listingId: pub.listingId,
        portalKey: pub.portal.key,
      },
      { delayMs: i * 5_000 < STAGGER_MS ? i * 5_000 : STAGGER_MS },
    );
    i++;
  }
  return due.length;
}

/**
 * Scan for publications whose auto-bump is due and enqueue refresh jobs.
 * Invoked by a scheduler (cron / repeatable job) — see README.
 */
export async function enqueueDueRefreshes(): Promise<number> {
  const due = await prisma.publication.findMany({
    where: {
      status: "PUBLISHED",
      nextRefreshAt: { lte: new Date() },
    },
    include: { portal: true, listing: { select: { userId: true } } },
    take: 500,
  });

  // Stagger jobs so we don't hammer a portal (and get rate-limited/blocked).
  // Each subsequent due item is delayed a bit more than the previous one.
  const STAGGER_MS = Number(process.env.REFRESH_STAGGER_MS ?? 90_000);
  let i = 0;
  for (const pub of due) {
    const provider = getProvider(pub.portal.key);
    if (!provider.supportsRefresh) continue;
    await enqueueTask(
      "refresh",
      {
        publicationId: pub.id,
        userId: pub.listing.userId,
        listingId: pub.listingId,
        portalKey: pub.portal.key,
      },
      // No auto-retry (see refreshListing) — a repost may trigger SMS.
      { delayMs: i * STAGGER_MS, attempts: 1 },
    );
    i++;
  }
  return due.length;
}
