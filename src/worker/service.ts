import { prisma } from "../lib/db";
import { logActivity } from "../lib/logger";
import { notifyUser } from "../lib/notify";
import { classifyError } from "../lib/errors";
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
const SITE = (process.env.AUTH_URL ?? "https://klikado.sk").replace(/\/$/, "");

/** Human-friendly portal name for e-mails/notifications. */
function portalLabel(key: string): string {
  const map: Record<string, string> = {
    "bazos-sk": "Bazoš SK",
    "bazos-cz": "Bazoš CZ",
    "bazar-sk": "Bazar.sk",
  };
  return map[key] ?? key;
}

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

  // E-mail the customer that the ad is waiting on them — the portal requires a
  // verification (SMS) code. Also happens during automatic re-postings, so the
  // owner always knows an ad couldn't be completed without their input.
  const portal = portalLabel(data.portalKey);
  const listing = await prisma.listing
    .findUnique({ where: { id: data.listingId }, select: { title: true } })
    .catch(() => null);
  const title = listing?.title ?? "inzerát";
  await notifyUser(data.userId, {
    title: `Inzerát čaká na overenie – ${portal}`,
    body:
      `Portál ${portal} žiada overenie telefónneho čísla, inak inzerát „${title}“ nezverejní.\n\n` +
      `${prompt}\n\n` +
      `Otvor Klikado a zadaj overovací kód. Ak ho nezadáš, inzerát sa nevybaví.`,
    type: "PUBLISH_ERROR",
    url: `${SITE}/listings/${data.listingId}`,
    buttonLabel: "Zadať kód v Klikade",
  }).catch(() => undefined);

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

  // Timed out with no code — tell the owner the ad wasn't completed so it isn't
  // silently forgotten (especially for unattended automatic re-postings).
  await notifyUser(data.userId, {
    title: `Inzerát sa nevybavil – ${portal} žiada overenie`,
    body:
      `Inzerát „${title}“ sa na portáli ${portal} nezverejnil, pretože portál žiada overenie ` +
      `telefónneho čísla (SMS kód) a ten nebol zadaný včas.\n\n` +
      `Otvor Klikado a skús inzerát pridať znova – pri overovaní budeš mať pripravený telefón.`,
    type: "PUBLISH_ERROR",
    url: `${SITE}/listings/${data.listingId}`,
    buttonLabel: "Otvoriť inzerát",
  }).catch(() => undefined);
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
  // Give the provider the listing's own title/e-mail/phone so posting AND the
  // post-publish "Moje inzeráty" lookup use THIS listing's number (not a profile
  // one). The phone the user typed on the listing always wins.
  ctx.listingTitle = payload.title;
  ctx.listingEmail = payload.email ?? undefined;
  ctx.listingPhone = payload.phone ?? undefined;
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
    // "Topovať" = re-post for a fresh date. STRICT order (duplicate = ban risk):
    //   1) check if the old ad still exists
    //   2) if so, delete it
    //   3) confirm it's really gone
    //   4) only THEN publish the fresh ad
    await ctx.log(
      "Topujem inzerát: 1) skontrolujem existujúci → 2) zmažem → 3) overím, že je preč → 4) až potom publikujem.",
    );

    // Step 1 — is the old ad still online?
    let stillLive = true;
    let checkedBefore = false;
    try {
      const before = await provider.checkStatus(pub.remoteId, session, ctx);
      checkedBefore = before.verified !== false;
      stillLive = before.live;
      await ctx.log(
        `1) Existujúci inzerát: ${
          stillLive
            ? "je online → idem ho zmazať"
            : checkedBefore
              ? "už nie je online"
              : "stav sa nepodarilo overiť"
        }.`,
      );
    } catch {
      await ctx.log(
        "1) Stav existujúceho inzerátu sa nepodarilo overiť — pre istotu sa ho pokúsim zmazať.",
      );
    }

    // Step 2 — delete it if it might still be there.
    let deleteOk = true;
    if (stillLive || !checkedBefore) {
      try {
        await provider.delete(pub.remoteId, session, ctx);
        await ctx.log("2) Zmazanie pôvodného inzerátu odoslané.");
      } catch (err) {
        deleteOk = false;
        await ctx.log("2) Mazanie pri topovaní zlyhalo: " + String(err));
      }
    } else {
      await ctx.log("2) Netreba mazať — inzerát už nie je online.");
    }

    // Step 3 — CONFIRM the old ad is gone before re-posting. Still live → skip;
    // confirmed removed → repost; couldn't verify → repost ONLY if the delete
    // itself succeeded.
    let safeToRepost: boolean;
    try {
      const after = await provider.checkStatus(pub.remoteId, session, ctx);
      if (after.live) safeToRepost = false;
      else if (after.verified) safeToRepost = true;
      else safeToRepost = deleteOk;
      await ctx.log(
        `3) Overenie po zmazaní: ${
          after.live ? "STÁLE ONLINE — nepublikujem (ochrana pred duplikátom)" : "inzerát je preč ✅"
        }.`,
      );
    } catch {
      safeToRepost = deleteOk;
    }

    if (!safeToRepost) {
      await ctx.log(
        "Nepodarilo sa potvrdiť zmazanie pôvodného inzerátu — topovanie preskočené, aby nevznikol duplikát (ochrana pred banom).",
      );
      const note =
        "Automatické topovanie sa dočasne pozastavilo — nepodarilo sa zmazať pôvodný inzerát (ochrana pred duplikátom). Skúsime znova; ak to pretrváva, over prihlásenie k portálu v sekcii Portály.";
      await prisma.publication.update({
        where: { id: data.publicationId },
        data: {
          nextRefreshAt: await computeNextRefresh(data.listingId, true),
          statusNote: note,
        },
      });
      // Notify once per failure episode (don't repeat every cycle).
      if (pub.statusNote !== note) {
        await notifyTopovanieFailed(
          data,
          "nepodarilo sa zmazať pôvodný inzerát na portáli",
        );
      }
      return;
    }

    await ctx.log("4) Starý inzerát je preč — publikujem čerstvý inzerát.");
    const payload = await buildPayload(data.listingId);
    ctx.listingTitle = payload.title;
    ctx.listingEmail = payload.email ?? undefined;
    ctx.listingPhone = payload.phone ?? undefined;
    let result;
    try {
      result = await provider.publish(payload, session, ctx);
    } catch (err) {
      // The old ad was removed but the fresh post failed — tell the user so they
      // can fix it (e.g. blocked SMS number → connect a portal account).
      await notifyTopovanieFailed(data, String(err));
      throw err;
    }
    await persistSessionRefresh(data.publicationId, result.session);
    await prisma.publication.update({
      where: { id: data.publicationId },
      data: {
        remoteId: result.remoteId,
        remoteUrl: result.remoteUrl,
        publishedAt: new Date(),
        lastRefreshedAt: new Date(),
        lastError: null,
        statusNote: null,
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

  // Give the provider (and the post-delete verification) the listing title +
  // e-mail + phone so it can find the ad reliably in "Moje inzeráty". Without
  // this, verification falls back to a direct-URL check that can wrongly look
  // "removed" and make us claim a deletion that never happened.
  const listing = await prisma.listing.findUnique({
    where: { id: data.listingId },
    select: { title: true, contactEmail: true, phone: true },
  });
  ctx.listingTitle = listing?.title;
  ctx.listingEmail = listing?.contactEmail ?? undefined;
  ctx.listingPhone = listing?.phone ?? undefined;

  if (pub.remoteId) {
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
    const provider = getProvider(data.portalKey);
    await provider.delete(pub.remoteId, session, ctx);

    // Verify the ad is ACTUALLY gone before reporting it removed. The portal's
    // "Moje inzeráty" search index can lag a few seconds after a delete, so
    // retry a few times before concluding it's still live — otherwise a truly
    // deleted ad gets a false "still online".
    let status: Awaited<ReturnType<typeof provider.checkStatus>> | null = null;
    let confirmedGone = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 3000 : 4000));
      status = await provider
        .checkStatus(pub.remoteId, session, ctx)
        .catch(() => null);
      if (status && status.verified === true && !status.live) {
        confirmedGone = true;
        break;
      }
      if (status && status.live) {
        await ctx.log(
          `Bazar.sk: inzerát ešte vidno v Moje inzeráty (pokus ${attempt + 1}/4) — čakám na aktualizáciu indexu…`,
        );
      }
    }
    if (!confirmedGone) {
      const stillLive = status?.live === true;
      await ctx.log(
        stillLive
          ? "Inzerát je po pokuse o zmazanie stále online — nechávam ho zverejnený a hlásim, že zmazanie zlyhalo."
          : "Zmazanie sa nepodarilo overiť — nechávam pôvodný stav a hlásim, že zmazanie zlyhalo.",
      );
      // Deletion failed. Do NOT flip to a confusing ERROR — the ad is still
      // live, so keep it PUBLISHED (the truth) and just attach a clear note that
      // the delete failed, with the "write to support" affordance in the UI.
      await prisma.publication.update({
        where: { id: data.publicationId },
        data: {
          status: stillLive ? "PUBLISHED" : pub.status,
          // remoteId/remoteUrl are intentionally kept — the ad is still online.
          statusNote:
            "Zmazanie sa nepodarilo — inzerát je stále zverejnený na portáli. Skús to znova, alebo napíš podpore.",
        },
      });
      return;
    }
    await ctx.log("Zmazanie overené — inzerát už nie je online. ✅");
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
  // No early return on a missing remote id — even a REMOVED ad with no id can
  // be confirmed by title via "Moje inzeráty" (and healed if it's there).
  const remoteId = pub.remoteId ?? "";

  // Give the provider the listing title + e-mail so it can open the portal's
  // "Moje inzeráty" (e-mail + per-ad password) and confirm the ad by name.
  const listing = await prisma.listing.findUnique({
    where: { id: data.listingId },
    select: { title: true, contactEmail: true, phone: true },
  });
  ctx.listingTitle = listing?.title;
  ctx.listingEmail = listing?.contactEmail ?? undefined;
  ctx.listingPhone = listing?.phone ?? undefined;

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
  const provider = getProvider(data.portalKey);
  const status = await provider.checkStatus(remoteId, session, ctx);

  const views =
    status.views != null
      ? { viewsCurrent: status.views, viewsCheckedAt: new Date() }
      : {};

  if (status.verified === false) {
    // Couldn't confirm. Only an ad that was ALREADY published stays PUBLISHED
    // (this prevents a false "removed" and heals an earlier wrong removal). An
    // ERROR/REMOVED ad must NOT be invented as PUBLISHED just because we can't
    // see "Moje inzeráty" — keep its status, only record that a check ran.
    if (pub.status === "PUBLISHED") {
      await prisma.publication.update({
        where: { id: data.publicationId },
        data: {
          status: "PUBLISHED",
          lastSyncedAt: new Date(),
          statusNote:
            "Stav sa nepodarilo overiť — Klikado nevidí „Moje inzeráty“. Skontroluj prihlasovacie údaje k Bazoš účtu v sekcii Portály.",
          ...views,
        },
      });
    } else {
      await prisma.publication.update({
        where: { id: data.publicationId },
        data: { lastSyncedAt: new Date(), ...views },
      });
    }
    return;
  }

  if (status.live) {
    await prisma.publication.update({
      where: { id: data.publicationId },
      data: {
        status: "PUBLISHED",
        remoteId: status.remoteId ?? pub.remoteId,
        remoteUrl: status.remoteUrl ?? pub.remoteUrl,
        lastSyncedAt: new Date(),
        statusNote: null, // confirmed live — clear any "unverified" note
        lastError: null,
        // Healing from ERROR/REMOVED → (re)start the auto-topovanie schedule.
        ...(pub.status !== "PUBLISHED"
          ? {
              nextRefreshAt: await computeNextRefresh(
                data.listingId,
                provider.supportsRefresh,
              ),
            }
          : {}),
        ...views,
      },
    });

    // If this ad had healed from a failure, auto-resolve any open ticket about
    // it and leave an internal note explaining why it closed itself.
    if (pub.status !== "PUBLISHED") {
      await prisma.supportThread
        .updateMany({
          where: {
            listingId: data.listingId,
            portalKey: data.portalKey,
            status: "OPEN",
          },
          data: {
            status: "CLOSED",
            adminUnread: false,
            internalNote: `Automaticky vyriešené (${new Date().toLocaleString("sk-SK")}): kontrola stavu potvrdila, že inzerát je opäť aktívny (PUBLISHED) na portáli — chyba sa vyriešila sama.`,
          },
        })
        .catch(() => {});
    }
    return;
  }

  // A genuine publish failure that never posted (ERROR, no remote id) should
  // stay ERROR so the user can retry/report — don't relabel it as "removed".
  if (pub.status === "ERROR" && !pub.remoteId) {
    await prisma.publication.update({
      where: { id: data.publicationId },
      data: { lastSyncedAt: new Date() },
    });
    return;
  }

  // Confidently gone (logged in to the account and the ad isn't in "Moje
  // inzeráty"). Mark it removed and stop tracking the id so it isn't re-checked.
  await prisma.publication.update({
    where: { id: data.publicationId },
    data: {
      status: "REMOVED",
      remoteId: null,
      lastSyncedAt: new Date(),
      statusNote: "Potvrdené: inzerát sa už na portáli nenachádza.",
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

/** Notify the listing owner that automatic topovanie failed, with the reason. */
async function notifyTopovanieFailed(
  data: BaseJobData,
  rawReason: string,
): Promise<void> {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: data.listingId },
      select: { title: true },
    });
    const reason = classifyError(rawReason).message;
    await notifyUser(data.userId, {
      title: "Automatické topovanie zlyhalo",
      body: `Inzerát „${listing?.title ?? "?"}“ — topovanie na ${data.portalKey} sa nepodarilo. ${reason}`,
      type: "PUBLISH_ERROR",
    });
  } catch {
    /* non-fatal */
  }
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
