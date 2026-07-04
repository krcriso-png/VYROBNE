import { prisma } from "./db";
import { enqueueTask } from "./queue";
import { getProvider } from "../providers/registry";
import { logActivity } from "./logger";
import { importAdFromUrl } from "./import-ad";
import { processAndStore } from "./images";
import { canAddActiveListing } from "./plans";

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

/**
 * Adopt an ad the user already posted on a portal (by URL) so Klikado manages
 * it — used to recover ads posted outside the app, or ones whose link wasn't
 * saved. Marks the publication PUBLISHED optimistically and enqueues a status
 * check that confirms it's really live (and flips it to REMOVED if the URL is
 * dead). The URL doubles as the remoteId for the direct-URL status check.
 */
export async function adoptListing(
  userId: string,
  listingId: string,
  portalKey: string,
  url: string,
): Promise<void> {
  await prisma.listing.findFirstOrThrow({ where: { id: listingId, userId } });
  const portal = await prisma.portal.findFirst({
    where: { key: portalKey, enabled: true },
  });
  if (!portal) throw new Error("Neznámy alebo vypnutý portál");

  const clean = url.trim();
  // The user may (optionally) have a saved account for this portal.
  const account = await prisma.portalAccount.findUnique({
    where: { userId_portalId: { userId, portalId: portal.id } },
  });

  const provider = getProvider(portal.key);
  // Schedule the first auto-topovanie if this portal supports it and the listing
  // has an interval set.
  const l = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { renewIntervalHours: true },
  });
  const nextRefreshAt =
    provider.supportsRefresh && l?.renewIntervalHours
      ? new Date(Date.now() + l.renewIntervalHours * 60 * 60 * 1000)
      : null;

  await prisma.publication.upsert({
    where: { listingId_portalId: { listingId, portalId: portal.id } },
    create: {
      listingId,
      portalId: portal.id,
      portalAccountId: account?.id ?? null,
      status: "PUBLISHED",
      remoteId: clean,
      remoteUrl: clean,
      publishedAt: new Date(),
      lastError: null,
      statusNote: "Priradený existujúci inzerát — overujem stav…",
      nextRefreshAt,
    },
    update: {
      status: "PUBLISHED",
      remoteId: clean,
      remoteUrl: clean,
      publishedAt: new Date(),
      lastError: null,
      statusNote: "Priradený existujúci inzerát — overujem stav…",
    },
  });

  const pub = await prisma.publication.findUnique({
    where: { listingId_portalId: { listingId, portalId: portal.id } },
    select: { id: true },
  });
  if (pub) {
    await enqueueTask("check_status", {
      publicationId: pub.id,
      userId,
      listingId,
      portalKey: portal.key,
    });
  }
}

/**
 * Import an existing ad from a portal URL: scrape its title/description/price/
 * photos, create a listing pre-filled with them, download the photos, and adopt
 * the ad (mark it PUBLISHED on that portal by URL) so Klikado manages it. The
 * user reviews/edits afterwards. Returns the new listing id.
 */
export async function importListingFromUrl(
  userId: string,
  url: string,
): Promise<string> {
  const ad = await importAdFromUrl(url);

  // Respect the plan's active-listing limit (an import creates an active ad).
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const activeCount = await prisma.listing.count({
    where: { userId, status: "ACTIVE" },
  });
  if (!canAddActiveListing(sub?.plan ?? "FREE", activeCount)) {
    throw new Error("Dosiahnutý limit aktívnych inzerátov pre váš plán.");
  }

  const owner = await prisma.user.findUnique({ where: { id: userId } });

  const listing = await prisma.listing.create({
    data: {
      userId,
      title: ad.title,
      description: ad.description || ad.title,
      price: ad.price ?? null,
      currency: ad.currency,
      category: "Importované",
      parameters: { imported: true, importUrl: url },
      location: ad.location ?? null,
      contactName: owner?.name ?? null,
      contactEmail: owner?.email ?? null,
      status: "ACTIVE",
    },
  });

  await logActivity({
    message: `Import z ${ad.portalKey}: „${ad.title}" — cena ${
      ad.price ?? "?"
    } ${ad.currency}, ${ad.imageUrls.length} fotiek nájdených.`,
    userId,
    listingId: listing.id,
    portalKey: ad.portalKey,
  });

  // Download + store the photos (best-effort; skip any that fail).
  let position = 0;
  for (const imgUrl of ad.imageUrls) {
    try {
      const r = await fetch(imgUrl, { headers: { "user-agent": "Mozilla/5.0" } });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.byteLength < 1024) continue; // skip tiny/placeholder images
      const p = await processAndStore(userId, buf);
      await prisma.listingImage.create({
        data: {
          listingId: listing.id,
          key: p.key,
          thumbKey: p.thumbKey,
          url: p.url,
          width: p.width,
          height: p.height,
          bytes: p.bytes,
          mimeType: p.mimeType,
          position,
          isMain: position === 0,
        },
      });
      position += 1;
    } catch {
      /* skip broken image */
    }
  }

  // Adopt the ad on its source portal (marks it PUBLISHED + verifies).
  await adoptListing(userId, listing.id, ad.portalKey, url).catch(
    () => undefined,
  );

  return listing.id;
}

/**
 * Remove a listing from a single portal (portalKey given) or from ALL portals
 * (portalKey omitted). Only the portal ads are deleted — the listing itself
 * stays in Klikado, so the user can re-publish it later.
 */
export async function unpublishListing(
  userId: string,
  listingId: string,
  portalKey?: string,
): Promise<void> {
  const publications = await prisma.publication.findMany({
    where: {
      listingId,
      listing: { userId },
      ...(portalKey ? { portal: { key: portalKey } } : {}),
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
  // Fetch ALL publications of the listing (any status) so we can both diagnose
  // and re-verify every portal the user tried — including ones stuck in
  // WAITING_SMS / PUBLISHING / PENDING from an interrupted run.
  const allPubs = await prisma.publication.findMany({
    where: { listingId, listing: { userId } },
    include: { portal: true },
  });

  // Surface exactly which portals exist + their status (so it's obvious in the
  // log whether a portal like Bazar.sk is missing vs. just in a skipped state).
  await logActivity({
    message:
      "Skontrolovať stav — publikácie inzerátu: " +
      (allPubs.length
        ? allPubs.map((p) => `${p.portal.key}:${p.status}`).join(", ")
        : "žiadne"),
    userId,
    listingId,
  });

  let i = 0;
  for (const pub of allPubs) {
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
  return allPubs.length;
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
