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

async function main() {
  // --- Portals from the registry ---
  for (const provider of listProviders()) {
    await prisma.portal.upsert({
      where: { key: provider.key },
      create: {
        key: provider.key,
        name: provider.name,
        country: provider.country,
        integration: provider.integration,
        supportsRefresh: provider.supportsRefresh,
        // The mock portal is the only one enabled by default; real portals are
        // turned on by an admin once their flow is verified.
        enabled: provider.key === "mock",
      },
      update: {
        name: provider.name,
        country: provider.country,
        integration: provider.integration,
        supportsRefresh: provider.supportsRefresh,
      },
    });
  }
  console.log(`Seeded ${listProviders().length} portals`);

  // --- Demo admin user ---
  const email = "admin@inzeromat.local";
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
