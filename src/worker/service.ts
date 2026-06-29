import { prisma } from "../lib/db";
import { logActivity } from "../lib/logger";
import { spendCredits, hasCredits } from "../lib/credits";
import { signedDownloadUrl } from "../lib/storage";
import { encryptJson, decrypt, decryptJson } from "../lib/crypto";
import { getProvider } from "../providers/registry";
import type {
  ListingPayload,
  ProviderContext,
  ProviderCredentials,
  ProviderSession,
} from "../providers/types";
import type { BaseJobData } from "../lib/queue/types";

// ===========================================================================
// Worker service layer
//
// Translates a queue job into a provider call: loads the publication, builds
// the normalised payload, decrypts credentials, runs the verb, and writes the
// outcome back (status, remote ids, session refresh, logs). Each processor in
// index.ts is a thin wrapper around the functions here.
// ===========================================================================

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== "false";

/** Build a logger/context scoped to this publication. */
function buildContext(data: BaseJobData): ProviderContext {
  return {
    headless: HEADLESS,
    log: (message, meta) =>
      logActivity({
        message,
        meta,
        userId: data.userId,
        listingId: data.listingId,
        portalKey: data.portalKey,
      }),
    requestUserInput: (prompt) => waitForUserInput(data, prompt),
  };
}

/**
 * Pause the job and wait for the user to submit a value (e.g. an SMS code).
 * Sets the publication to WAITING_SMS with a prompt, then polls for smsCode.
 * Returns the code (and clears it) or null after a timeout.
 */
async function waitForUserInput(
  data: BaseJobData,
  prompt: string,
  timeoutMs = 10 * 60 * 1000,
  pollMs = 4000,
): Promise<string | null> {
  await prisma.publication.update({
    where: { id: data.publicationId },
    data: { status: "WAITING_SMS", smsPrompt: prompt, smsCode: null },
  });
  await logActivity({
    message: `Čakám na zadanie: ${prompt}`,
    userId: data.userId,
    listingId: data.listingId,
    portalKey: data.portalKey,
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const pub = await prisma.publication.findUnique({
      where: { id: data.publicationId },
      select: { smsCode: true },
    });
    if (pub?.smsCode) {
      await prisma.publication.update({
        where: { id: data.publicationId },
        data: { status: "PUBLISHING", smsPrompt: null, smsCode: null },
      });
      return pub.smsCode.trim();
    }
  }
  return null;
}

/** Load + normalise the listing into the provider-facing payload. */
async function buildPayload(listingId: string): Promise<ListingPayload> {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { images: { orderBy: { position: "asc" } } },
  });

  // Provider downloads bytes via short-lived signed URLs (never public keys).
  const images = await Promise.all(
    listing.images.map(async (img) => ({
      url: await signedDownloadUrl(img.key),
      position: img.position,
      isMain: img.isMain,
    })),
  );

  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    price: listing.price ? Number(listing.price) : null,
    currency: listing.currency,
    category: listing.category,
    parameters: (listing.parameters as Record<string, unknown>) ?? {},
    tags: listing.tags,
    location: listing.location,
    zip: listing.zip,
    contactName: listing.contactName,
    phone: listing.phone,
    email: listing.contactEmail,
    web: listing.web,
    images,
  };
}

/** Decrypt the stored portal account into provider credentials. */
function buildCredentials(account: {
  login: string | null;
  passwordEnc: string | null;
  cookiesEnc: string | null;
  sessionEnc: string | null;
}): ProviderCredentials {
  return {
    login: account.login,
    password: decrypt(account.passwordEnc),
    session:
      decryptJson(account.sessionEnc) ?? decryptJson(account.cookiesEnc),
  };
}

/**
 * Resolve a usable session for the publication's portal account: reuse the
 * stored one if valid, otherwise log in and persist the fresh session.
 */
async function ensureSession(
  publicationId: string,
  data: BaseJobData,
  ctx: ProviderContext,
): Promise<{
  session: ProviderSession;
  accountId: string;
  credentials: ProviderCredentials;
  verifyPhone: string | null;
}> {
  const publication = await prisma.publication.findUniqueOrThrow({
    where: { id: publicationId },
    include: { portalAccount: true, portal: true },
  });

  const account = publication.portalAccount;
  if (!account) {
    throw new Error(
      `No portal account linked for publication ${publicationId}`,
    );
  }

  const provider = getProvider(data.portalKey);
  const credentials = buildCredentials(account);

  const stored = decryptJson(account.sessionEnc) as unknown;
  const stillValid =
    stored &&
    account.sessionValidUntil &&
    account.sessionValidUntil > new Date() &&
    !account.needsReauth;

  if (stillValid) {
    return {
      session: { state: stored },
      accountId: account.id,
      credentials,
      verifyPhone: account.verifyPhone,
    };
  }

  const session = await provider.login(credentials, ctx);
  await prisma.portalAccount.update({
    where: { id: account.id },
    data: {
      sessionEnc: encryptJson(session.state),
      sessionValidUntil: session.validUntil ?? null,
      lastLoginAt: new Date(),
      needsReauth: false,
    },
  });
  return {
    session,
    accountId: account.id,
    credentials,
    verifyPhone: account.verifyPhone,
  };
}

async function setStatus(
  publicationId: string,
  status: Parameters<typeof prisma.publication.update>[0]["data"]["status"],
  extra: Record<string, unknown> = {},
) {
  await prisma.publication.update({
    where: { id: publicationId },
    data: { status, ...extra },
  });
}

// --- verb handlers ---------------------------------------------------------

export async function runPublish(data: BaseJobData): Promise<void> {
  const ctx = buildContext(data);
  await setStatus(data.publicationId, "PUBLISHING");
  const { session, credentials, accountId, verifyPhone } = await ensureSession(
    data.publicationId,
    data,
    ctx,
  );
  ctx.secrets = {
    login: credentials.login,
    password: credentials.password,
    verifyPhone,
  };
  // Allow the provider to persist a freshly-verified session mid-flow.
  ctx.saveSession = async (s) => {
    await prisma.portalAccount.update({
      where: { id: accountId },
      data: {
        sessionEnc: encryptJson(s.state),
        sessionValidUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        needsReauth: false,
      },
    });
  };
  const payload = await buildPayload(data.listingId);
  const provider = getProvider(data.portalKey);

  const pub = await prisma.publication.findUniqueOrThrow({
    where: { id: data.publicationId },
  });

  // A fresh publish (no prior remote id) costs a credit; re-publishing an
  // already-live ad just updates it in place and is free.
  const wasNew = !pub.remoteId;
  const result = wasNew
    ? await provider.publish(payload, session, ctx)
    : await provider.update(pub.remoteId!, payload, session, ctx);

  await persistSessionRefresh(data.publicationId, result.session);
  await setStatus(data.publicationId, "PUBLISHED", {
    remoteId: result.remoteId,
    remoteUrl: result.remoteUrl,
    publishedAt: new Date(),
    lastSyncedAt: new Date(),
    lastError: null,
    nextRefreshAt: await computeNextRefresh(data.listingId, provider.supportsRefresh),
  });

  if (wasNew) {
    // Charge after a confirmed publish so failures never cost the user.
    await spendCredits(data.userId, 1, "publish", data.listingId).catch(
      () => undefined,
    );
  }
}

export async function runUpdate(data: BaseJobData): Promise<void> {
  const ctx = buildContext(data);
  const pub = await prisma.publication.findUniqueOrThrow({
    where: { id: data.publicationId },
  });
  if (!pub.remoteId) return runPublish(data); // nothing remote yet
  await setStatus(data.publicationId, "UPDATING");
  const { session, credentials, verifyPhone } = await ensureSession(
    data.publicationId,
    data,
    ctx,
  );
  ctx.secrets = {
    login: credentials.login,
    password: credentials.password,
    verifyPhone,
  };
  const payload = await buildPayload(data.listingId);
  const provider = getProvider(data.portalKey);

  // Edit the ad IN PLACE (provider.update). For Bazoš this uses the
  // "Editovať inzerát" flow, so it does not re-post or trigger a new SMS
  // verification, and keeps the same remote id + accumulated views.
  const result = await provider.update(pub.remoteId, payload, session, ctx);
  await persistSessionRefresh(data.publicationId, result.session);
  await setStatus(data.publicationId, "PUBLISHED", {
    remoteId: result.remoteId ?? pub.remoteId,
    remoteUrl: result.remoteUrl,
    lastSyncedAt: new Date(),
    lastError: null,
  });
}

export async function runRefresh(data: BaseJobData): Promise<void> {
  const ctx = buildContext(data);
  const pub = await prisma.publication.findUniqueOrThrow({
    where: { id: data.publicationId },
  });
  if (!pub.remoteId) return;

  // Topovať costs a credit. If the user is out, skip this run and push the
  // next attempt forward so the scheduler doesn't loop on it every tick.
  if (!(await hasCredits(data.userId, 1))) {
    await ctx.log("Nedostatok kreditov — automatické topovanie preskočené");
    await prisma.publication.update({
      where: { id: data.publicationId },
      data: { nextRefreshAt: await computeNextRefresh(data.listingId, true) },
    });
    return;
  }

  const { session, credentials, accountId, verifyPhone } = await ensureSession(
    data.publicationId,
    data,
    ctx,
  );
  ctx.secrets = {
    login: credentials.login,
    password: credentials.password,
    verifyPhone,
  };
  ctx.saveSession = async (s) => {
    await prisma.portalAccount.update({
      where: { id: accountId },
      data: {
        sessionEnc: encryptJson(s.state),
        sessionValidUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        needsReauth: false,
      },
    });
  };
  const provider = getProvider(data.portalKey);

  if (provider.refreshStrategy === "repost") {
    // "Topovať" = delete the old ad and publish a fresh one.
    await ctx.log("Topujem inzerát (zmazať + nahrať znova)");
    try {
      await provider.delete(pub.remoteId, session, ctx);
    } catch (err) {
      await ctx.log("Mazanie pri topovaní zlyhalo, pokračujem: " + String(err));
    }
    const payload = await buildPayload(data.listingId);
    const result = await provider.publish(payload, session, ctx);
    await persistSessionRefresh(data.publicationId, result.session);
    await prisma.publication.update({
      where: { id: data.publicationId },
      data: {
        remoteId: result.remoteId,
        remoteUrl: result.remoteUrl,
        publishedAt: new Date(),
        lastRefreshedAt: new Date(),
        lastError: null,
        nextRefreshAt: await computeNextRefresh(data.listingId, true),
        // The old ad's views are now gone; fold them into the cumulative base
        // so the total reach survives the re-post.
        viewsBase: { increment: pub.viewsCurrent },
        viewsCurrent: 0,
      },
    });
    await spendCredits(data.userId, 1, "topovat", data.listingId).catch(
      () => undefined,
    );
    return;
  }

  await provider.refresh(pub.remoteId, session, ctx);
  await prisma.publication.update({
    where: { id: data.publicationId },
    data: {
      lastRefreshedAt: new Date(),
      nextRefreshAt: await computeNextRefresh(data.listingId, true),
    },
  });
  await spendCredits(data.userId, 1, "topovat", data.listingId).catch(
    () => undefined,
  );
}

export async function runDelete(data: BaseJobData): Promise<void> {
  const ctx = buildContext(data);
  const pub = await prisma.publication.findUniqueOrThrow({
    where: { id: data.publicationId },
  });
  await setStatus(data.publicationId, "REMOVING");
  if (pub.remoteId) {
    const { session } = await ensureSession(data.publicationId, data, ctx);
    const provider = getProvider(data.portalKey);
    await provider.delete(pub.remoteId, session, ctx);
  }
  await setStatus(data.publicationId, "REMOVED", {
    remoteId: null,
    remoteUrl: null,
    nextRefreshAt: null,
  });
}

export async function runCheckStatus(data: BaseJobData): Promise<void> {
  const ctx = buildContext(data);
  const pub = await prisma.publication.findUniqueOrThrow({
    where: { id: data.publicationId },
  });
  if (!pub.remoteId) return;
  const { session } = await ensureSession(data.publicationId, data, ctx);
  const provider = getProvider(data.portalKey);
  const status = await provider.checkStatus(pub.remoteId, session, ctx);
  await prisma.publication.update({
    where: { id: data.publicationId },
    data: {
      status: status.live ? "PUBLISHED" : "REMOVED",
      remoteUrl: status.remoteUrl ?? pub.remoteUrl,
      lastSyncedAt: new Date(),
      ...(status.views != null
        ? { viewsCurrent: status.views, viewsCheckedAt: new Date() }
        : {}),
    },
  });
}

/** Mark a publication as errored (called by the worker's failure handler). */
export async function markError(
  publicationId: string,
  error: string,
): Promise<void> {
  await prisma.publication
    .update({
      where: { id: publicationId },
      data: {
        status: "ERROR",
        lastError: error.slice(0, 2000),
        attempts: { increment: 1 },
      },
    })
    .catch(() => undefined);
}

// --- helpers ---------------------------------------------------------------

async function persistSessionRefresh(
  publicationId: string,
  session?: ProviderSession,
) {
  if (!session) return;
  const pub = await prisma.publication.findUnique({
    where: { id: publicationId },
    select: { portalAccountId: true },
  });
  if (!pub?.portalAccountId) return;
  await prisma.portalAccount.update({
    where: { id: pub.portalAccountId },
    data: {
      sessionEnc: encryptJson(session.state),
      sessionValidUntil: session.validUntil ?? null,
    },
  });
}

async function computeNextRefresh(
  listingId: string,
  supportsRefresh: boolean,
): Promise<Date | null> {
  if (!supportsRefresh) return null;
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { renewIntervalHours: true },
  });
  if (!listing?.renewIntervalHours) return null;
  return new Date(Date.now() + listing.renewIntervalHours * 60 * 60 * 1000);
}
