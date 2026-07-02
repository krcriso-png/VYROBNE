import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { listProviders } from "../src/providers/registry";

// ===========================================================================
// Seed
//
// 1. Upserts the Portal catalogue from the provider registry (single source
//    of truth — adding a provider automatically registers its portal).
// 2. Creates a demo admin user with a FREE subscription for local development.
// ===========================================================================

const prisma = new PrismaClient();

// Which portals are enabled is controlled per-environment via ENABLE_PORTALS
// (comma-separated keys). Default: just the mock portal. On a server that runs
// the worker + browser, set e.g. ENABLE_PORTALS=mock,bazos-sk,bazos-cz.
const ENABLED = (process.env.ENABLE_PORTALS ?? "mock")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// The real, production-ready browser portals are always enabled regardless of
// the per-environment ENABLE_PORTALS list, so a host that can run Chromium (e.g.
// Railway) gets them live without ENABLE_PORTALS needing an entry per portal.
const ALWAYS_ON = new Set(["bazos-sk", "bazos-cz", "bazar-sk"]);

async function main() {
  // --- Portals from the registry ---
  for (const provider of listProviders()) {
    const enabled = ENABLED.includes(provider.key) || ALWAYS_ON.has(provider.key);
    await prisma.portal.upsert({
      where: { key: provider.key },
      create: {
        key: provider.key,
        name: provider.name,
        country: provider.country,
        integration: provider.integration,
        supportsRefresh: provider.supportsRefresh,
        enabled,
      },
      update: {
        name: provider.name,
        country: provider.country,
        integration: provider.integration,
        supportsRefresh: provider.supportsRefresh,
        // Reflect the env-driven enable list on every seed run.
        enabled,
      },
    });
  }
  console.log(`Seeded ${listProviders().length} portals (enabled: ${ENABLED.join(", ")})`);

  // --- Demo admin user ---
  const email = "admin@klikado.local";
  const passwordHash = await bcrypt.hash("admin1234", 12);
  const admin = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Demo Admin",
      role: "ADMIN",
      emailVerified: new Date(),
      passwordHash,
      subscription: { create: { plan: "PRO", status: "ACTIVE" } },
    },
    update: { role: "ADMIN" },
  });
  console.log(`Demo admin: ${email} / admin1234 (id=${admin.id})`);

  // --- One-off admin promotion + data migration (env-driven) ---
  await promoteAndMigrateAdmin();
}

/**
 * Optional, env-driven admin setup that runs on every seed (idempotent):
 *
 *   PROMOTE_ADMIN_EMAIL  – promote this existing account to ADMIN.
 *   MIGRATE_ADMIN_FROM   – (optional) move all data owned by this account
 *                          (listings, portal logins, credits, logs, tickets)
 *                          onto the promoted account.
 *
 * Safe to leave the variables in place: once the source account has been
 * emptied, subsequent runs move nothing. Remove them afterwards to keep the
 * config tidy.
 */
async function promoteAndMigrateAdmin(): Promise<void> {
  const promoteEmail = process.env.PROMOTE_ADMIN_EMAIL?.trim();
  if (!promoteEmail) return;

  const target = await prisma.user.findFirst({
    where: { email: { equals: promoteEmail, mode: "insensitive" } },
  });
  if (!target) {
    console.log(
      `[admin] PROMOTE_ADMIN_EMAIL=${promoteEmail} — účet zatiaľ neexistuje, preskakujem (zaregistruj ho a reštartni).`,
    );
    return;
  }

  if (target.role !== "ADMIN") {
    await prisma.user.update({
      where: { id: target.id },
      data: { role: "ADMIN" },
    });
    console.log(`[admin] ${target.email} povýšený na ADMIN.`);
  } else {
    console.log(`[admin] ${target.email} už je ADMIN.`);
  }
  // Make sure the admin has a subscription row (PRO = unlimited credits).
  await prisma.subscription.upsert({
    where: { userId: target.id },
    create: { userId: target.id, plan: "PRO", status: "ACTIVE" },
    update: { plan: "PRO", status: "ACTIVE" },
  });

  const fromEmail = process.env.MIGRATE_ADMIN_FROM?.trim();
  if (!fromEmail) return;
  if (fromEmail.toLowerCase() === target.email.toLowerCase()) {
    console.log("[admin] MIGRATE_ADMIN_FROM je ten istý účet — preskakujem.");
    return;
  }

  const source = await prisma.user.findFirst({
    where: { email: { equals: fromEmail, mode: "insensitive" } },
  });
  if (!source) {
    console.log(`[admin] MIGRATE_ADMIN_FROM=${fromEmail} — zdrojový účet sa nenašiel.`);
    return;
  }
  if (source.id === target.id) return;

  // Portal logins: move each, skipping any portal the target already has (the
  // unique (userId, portalId) constraint would otherwise reject it).
  const srcPortals = await prisma.portalAccount.findMany({
    where: { userId: source.id },
    select: { id: true, portalId: true },
  });
  let movedPortals = 0;
  for (const pa of srcPortals) {
    const clash = await prisma.portalAccount.findFirst({
      where: { userId: target.id, portalId: pa.portalId },
      select: { id: true },
    });
    if (clash) continue;
    await prisma.portalAccount.update({
      where: { id: pa.id },
      data: { userId: target.id },
    });
    movedPortals++;
  }

  const [listings, credits, logs, notifs, threads] = await Promise.all([
    prisma.listing.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    }),
    prisma.creditTransaction.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    }),
    prisma.activityLog.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    }),
    prisma.notification.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    }),
    prisma.supportThread.updateMany({
      where: { userId: source.id },
      data: { userId: target.id },
    }),
  ]);

  // Carry over the default contact phone if the admin doesn't have one yet.
  if (!target.phone && source.phone) {
    await prisma.user.update({
      where: { id: target.id },
      data: { phone: source.phone },
    });
  }

  console.log(
    `[admin] Presun z ${source.email} → ${target.email}: ` +
      `${listings.count} inzerátov, ${movedPortals}/${srcPortals.length} portálov, ` +
      `${credits.count} kreditových záznamov, ${logs.count} logov, ` +
      `${notifs.count} notifikácií, ${threads.count} ticketov.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
