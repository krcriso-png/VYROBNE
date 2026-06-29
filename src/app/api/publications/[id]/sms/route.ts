import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";

const schema = z.object({ code: z.string().min(1).max(40) });

// POST /api/publications/:id/sms — submit the SMS/verification code for a
// publication the worker is paused on (status WAITING_SMS). The polling worker
// picks it up and resumes.
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const { code } = schema.parse(await req.json());

  const pub = await prisma.publication.findFirst({
    where: { id, listing: { userId: user.id } },
    select: { id: true, status: true },
  });
  if (!pub) throw new HttpError(404, "Publikácia nenájdená");
  if (pub.status !== "WAITING_SMS") {
    throw new HttpError(409, "Táto publikácia práve nečaká na kód");
  }

  await prisma.publication.update({
    where: { id },
    data: { smsCode: code.trim() },
  });
  return json({ ok: true });
});
