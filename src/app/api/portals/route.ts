import { prisma } from "@/lib/db";
import { route, json, requireUser } from "@/lib/api";

// GET /api/portals — catalogue of enabled portals plus whether the current
// user already has an account configured for each (drives the publish UI).
export const GET = route(async () => {
  const user = await requireUser();
  const portals = await prisma.portal.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
    include: {
      accounts: { where: { userId: user.id }, select: { id: true, label: true } },
    },
  });

  return json({
    portals: portals.map((p) => ({
      key: p.key,
      name: p.name,
      country: p.country,
      integration: p.integration,
      supportsRefresh: p.supportsRefresh,
      hasAccount: p.accounts.length > 0,
    })),
  });
});
