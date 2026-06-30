import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, json, requireAdmin } from "@/lib/api";

const bodySchema = z.object({
  listingId: z.string().min(1),
  portalKey: z.string().nullable().optional(),
});

// DELETE /api/admin/incidents — remove an incident from the admin list by
// deleting its error-log entries for that listing+portal. The incident
// reappears only if the publication fails again.
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
  return json({ ok: true });
});
