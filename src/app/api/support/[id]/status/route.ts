import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, json, requireAdmin, HttpError } from "@/lib/api";

const bodySchema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });

// POST /api/support/:id/status — admin marks a thread open/closed (resolved).
export const POST = route(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await params;
    const { status } = bodySchema.parse(await req.json());

    const thread = await prisma.supportThread.findUnique({ where: { id } });
    if (!thread) throw new HttpError(404, "Vlákno nenájdené");

    await prisma.supportThread.update({ where: { id }, data: { status } });
    return json({ ok: true, status });
  },
);
