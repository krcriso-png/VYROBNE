import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, json, requireUser } from "@/lib/api";
import { notifyAdmins } from "@/lib/notify";
import { publicOrigin } from "@/lib/url";

const bodySchema = z.object({
  subject: z.string().trim().min(2).max(150),
  body: z.string().trim().min(2).max(5000),
});

// POST /api/support — a user opens a new support thread (a "podnet").
// Creates the thread + first message and notifies the admin (in-app + e-mail).
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const { subject, body } = bodySchema.parse(await req.json());

  const thread = await prisma.supportThread.create({
    data: {
      userId: user.id,
      subject,
      adminUnread: true,
      userUnread: false,
      messages: { create: { author: "USER", body } },
    },
  });

  const origin = publicOrigin(req);
  await notifyAdmins({
    title: `Nový podnet: ${subject}`,
    body:
      `Od: ${user.email}\n\n${body}\n\n` +
      `Odpovedz v Klikade: ${origin}/podpora`,
  });

  return json({ ok: true, id: thread.id });
});
