import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { notifyAdmins, notifyUser } from "@/lib/notify";
import { publicOrigin } from "@/lib/url";

const bodySchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

// POST /api/support/:id/messages — add a message to a thread.
// The admin replying notifies the thread's owner; the owner replying notifies
// the admins. Both channels: in-app notification + e-mail.
export const POST = route(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;
    const { body } = bodySchema.parse(await req.json());

    const thread = await prisma.supportThread.findUnique({ where: { id } });
    if (!thread) throw new HttpError(404, "Vlákno nenájdené");

    const isAdmin = user.role === "ADMIN";
    const isOwner = thread.userId === user.id;
    if (!isAdmin && !isOwner) throw new HttpError(403, "Prístup zamietnutý");

    await prisma.supportMessage.create({
      data: { threadId: id, author: isAdmin ? "ADMIN" : "USER", body },
    });
    await prisma.supportThread.update({
      where: { id },
      data: isAdmin
        ? { userUnread: true, adminUnread: false, status: "OPEN" }
        : { adminUnread: true, userUnread: false, status: "OPEN" },
    });

    const origin = publicOrigin(req);
    if (isAdmin) {
      await notifyUser(thread.userId, {
        title: `Odpoveď podpory: ${thread.subject}`,
        body: `${body}\n\nZobraziť v Klikade: ${origin}/podpora`,
      });
    } else {
      await notifyAdmins({
        title: `Nová správa v podnete: ${thread.subject}`,
        body: `Od: ${user.email}\n\n${body}\n\nOdpovedz: ${origin}/podpora`,
      });
    }

    return json({ ok: true });
  },
);
