import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, json, requireAdmin } from "@/lib/api";

const bodySchema = z.object({
  listingId: z.string().min(1),
  portalKey: z.string().nullable().optional(),
});

// DELETE /api/admin/incidents — resolve an incident: delete its error-log
// entries AND clear the ERROR state on the matching publication, so the "Chyby
// publikácií" count and the red menu alert actually drop. The publication moves
// to REMOVED — a failed publish isn't live, so that's the honest state, and the
// owner can re-publish it anytime. (A live-but-errored ad should instead be
// fixed with "Skontrolovať stav", which heals it to PUBLISHED.)
export const DELETE = route(async (req: Request) => {
  await requireAdmin();
  const { listingId, portalKey } = bodySchema.parse(await req.json());

  await prisma.activityLog.deleteMany({
    where: {
      level: "ERROR",
      listingId,
      portalKey: portalKey ?? null,
    },
  });

  const portalId = portalKey
    ? (await prisma.portal.findUnique({ where: { key: portalKey } }))?.id
    : undefined;
  await prisma.publication.updateMany({
    where: {
      listingId,
      status: "ERROR",
      ...(portalId ? { portalId } : {}),
    },
    data: { status: "REMOVED", lastError: null, statusNote: null },
  });

  return json({ ok: true });
});
