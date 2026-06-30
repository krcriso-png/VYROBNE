import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, json, requireAdmin, HttpError } from "@/lib/api";
import { PLANS } from "@/lib/plans";

const bodySchema = z.object({ plan: z.enum(["FREE", "BASIC", "PRO"]) });

// POST /api/admin/users/:id/plan — admin sets a user's subscription plan and
// resets their monthly credit allowance to match.
export const POST = route(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await params;
    const { plan } = bodySchema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, "Používateľ nenájdený");

    const allowance = PLANS[plan].monthlyCredits; // null = unlimited (PRO)
    const renewAt = new Date();
    renewAt.setMonth(renewAt.getMonth() + 1);

    await prisma.subscription.upsert({
      where: { userId: id },
      create: {
        userId: id,
        plan,
        status: "ACTIVE",
        credits: allowance ?? 0,
        creditsRenewAt: allowance === null ? null : renewAt,
      },
      update: {
        plan,
        status: "ACTIVE",
        credits: allowance ?? 0,
        creditsRenewAt: allowance === null ? null : renewAt,
      },
    });

    return json({ ok: true, plan });
  },
);
