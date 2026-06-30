import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, json, requireAdmin, HttpError } from "@/lib/api";
import { notifyUser } from "@/lib/notify";
import { publicOrigin } from "@/lib/url";

const bodySchema = z.object({ body: z.string().trim().min(1).max(5000) });

// POST /api/admin/publications/:id/contact — admin proactively opens a support
// thread with the customer about a failed publication (two-way comms), without
// waiting for them to report it.
export const POST = route(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await params;
    const { body } = bodySchema.parse(await req.json());

    const pub = await prisma.publication.findUnique({
      where: { id },
      include: {
        portal: { select: { key: true, name: true } },
        listing: { select: { id: true, userId: true, title: true } },
      },
    });
    if (!pub) throw new HttpError(404, "Publikácia nenájdená");

    const subject = `Publikovanie na ${pub.portal.name} – ${pub.listing.title}`;
    const thread = await prisma.supportThread.create({
      data: {
        userId: pub.listing.userId,
        subject,
        listingId: pub.listing.id,
        portalKey: pub.portal.key,
        userUnread: true,
        adminUnread: false,
        messages: { create: { author: "ADMIN", body } },
      },
    });

    const origin = publicOrigin(req);
    await notifyUser(pub.listing.userId, {
      title: `Správa od podpory: ${subject}`,
      body: `${body}\n\nZobraziť a odpovedať: ${origin}/podpora`,
    });

    return json({ ok: true, threadId: thread.id });
  },
);
