import { prisma } from "@/lib/db";
import { route, json, requireUser } from "@/lib/api";

// GET /api/portals — catalogue of enabled portals plus whether the current
// user already has an account configured for each (drives the publish UI).
export const GET = route(async () => {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const portals = await prisma.portal.findMany({
    // The "mock" portal is a dev-only test target — never show it to users.
    // A portal "paused for users" is hidden from regular customers but stays
    // visible to admins (so they can keep testing it).
    where: {
      enabled: true,
      key: { not: "mock" },
      ...(isAdmin ? {} : { pausedForUsers: false }),
    },
    orderBy: { name: "asc" },
    include: {
      accounts: {
        where: { userId: user.id },
        // Return NON-SECRET saved values so the UI can pre-fill them (the
        // password is never returned — only whether one is stored).
        select: {
          id: true,
          label: true,
          login: true,
          verifyPhone: true,
          passwordEnc: true,
        },
      },
    },
  });

  return json({
    portals: portals.map((p) => {
      const acc = p.accounts[0];
      return {
        key: p.key,
        name: p.name,
        country: p.country,
        integration: p.integration,
        supportsRefresh: p.supportsRefresh,
        hasAccount: p.accounts.length > 0,
        paused: p.pausedForUsers,
        // Saved values so the edit form shows what's already there.
        login: acc?.login ?? "",
        verifyPhone: acc?.verifyPhone ?? "",
        hasPassword: !!acc?.passwordEnc,
      };
    }),
  });
});
