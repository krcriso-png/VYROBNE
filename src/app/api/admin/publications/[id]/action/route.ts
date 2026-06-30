import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, json, requireAdmin, HttpError } from "@/lib/api";
import { publishListing, recheckListing } from "@/lib/publishing";

const bodySchema = z.object({ action: z.enum(["republish", "recheck"]) });

// POST /api/admin/publications/:id/action — admin re-publishes or re-checks a
// failed publication on behalf of its owner (used from the incidents list,
// e.g. after deploying a fix). No ticket required.
export const POST = route(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await params;
    const { action } = bodySchema.parse(await req.json());

    const pub = await prisma.publication.findUnique({
      where: { id },
      include: {
        portal: { select: { key: true } },
        listing: { select: { id: true, userId: true } },
      },
    });
    if (!pub) throw new HttpError(404, "Publikácia nenájdená");

    if (action === "republish") {
      await publishListing(pub.listing.userId, pub.listing.id, [pub.portal.key]);
    } else {
      await recheckListing(pub.listing.userId, pub.listing.id);
    }
    return json({ ok: true });
  },
);
