import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, json, requireAdmin } from "@/lib/api";

const schema = z.object({
  key: z.string().min(1),
  pausedForUsers: z.boolean(),
});

// PATCH /api/admin/portals — admin toggles whether a portal is paused for
// regular customers (hidden from them, still usable by admins for testing).
export const PATCH = route(async (req: Request) => {
  await requireAdmin();
  const { key, pausedForUsers } = schema.parse(await req.json());
  await prisma.portal.update({
    where: { key },
    data: { pausedForUsers },
  });
  return json({ ok: true, key, pausedForUsers });
});
