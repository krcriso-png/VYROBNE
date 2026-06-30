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
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
