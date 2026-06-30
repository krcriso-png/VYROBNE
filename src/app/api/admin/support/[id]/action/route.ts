import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, json, requireAdmin, HttpError } from "@/lib/api";
import { publishListing, recheckListing } from "@/lib/publishing";
import { notifyUser } from "@/lib/notify";
import { publicOrigin } from "@/lib/url";

const bodySchema = z.object({
  action: z.enum(["republish", "recheck"]),
});

// POST /api/admin/support/:id/action — the admin runs an action on behalf of
// the ticket's customer (after deploying a fix): re-publish the listing to the
// affected portal, or re-check its status to verify it's now OK. Records an
// admin message in the thread and notifies the customer.
export const POST = route(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await params;
    const { action } = bodySchema.parse(await req.json());

    const thread = await prisma.supportThread.findUnique({ where: { id } });
    if (!thread) throw new HttpError(404, "Vlákno nenájdené");
    if (!thread.listingId) {
      throw new HttpError(
        400,
        "Tento ticket nie je naviazaný na inzerát, akcia sa nedá spustiť.",
      );
    }

    let note: string;
    if (action === "republish") {
      if (!thread.portalKey) {
        throw new HttpError(400, "Ticket nemá určený portál.");
      }
      await publishListing(thread.userId, thread.listingId, [thread.portalKey]);
      note = `Spustil som publikovanie znova na portál (${thread.portalKey}). Sleduj stav inzerátu — o chvíľu sa aktualizuje.`;
    } else {
      const n = await recheckListing(thread.userId, thread.listingId);
      note = `Spustil som overenie stavu inzerátu na ${n} portál(och). O chvíľu sa stav aktualizuje.`;
    }

    // Record it in the thread (so both sides see it) and notify the customer.
    await prisma.supportMessage.create({
      data: { threadId: id, author: "ADMIN", body: note },
    });
    await prisma.supportThread.update({
      where: { id },
      data: { userUnread: true, adminUnread: false, status: "OPEN" },
    });
    const origin = publicOrigin(req);
    await notifyUser(thread.userId, {
      title: `Aktualizácia podpory: ${thread.subject}`,
      body: `${note}\n\nZobraziť v Klikade: ${origin}/podpora`,
    });

    return json({ ok: true });
  },
);
