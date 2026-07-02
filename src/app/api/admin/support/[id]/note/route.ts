import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, json, requireAdmin } from "@/lib/api";

const schema = z.object({ note: z.string().max(4000).nullable().optional() });

// POST /api/admin/support/:id/note — save the admin-only internal note.
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const { note } = schema.parse(await req.json());
  await prisma.supportThread.update({
    where: { id },
    data: { internalNote: note ? note.trim() : null },
  });
  return json({ ok: true });
});
