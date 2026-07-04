import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, json, requireAdmin, HttpError } from "@/lib/api";
import { unpublishListing } from "@/lib/publishing";
import { notifyUser } from "@/lib/notify";

const bodySchema = z.object({
  reason: z.string().trim().min(3, "Napíš dôvod odstránenia.").max(2000),
});

// POST /api/admin/listings/:id/remove — admin (moderation) removes a customer's
// listing. The ad is taken down from every portal it was published to and
// archived in Klikado; the owner is always e-mailed the reason. Truthful: we
// only claim to have *started* the portal removal (it runs asynchronously and
// each portal is verified by the worker).
export const POST = route(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await params;
    const { reason } = bodySchema.parse(await req.json());

    const listing = await prisma.listing.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        title: true,
        status: true,
        _count: {
          select: {
            publications: { where: { status: { notIn: ["REMOVED"] } } },
          },
        },
      },
    });
    if (!listing) throw new HttpError(404, "Inzerát nenájdený");

    const hadLivePubs = listing._count.publications > 0;

    // Take it down from the portals first (async, verified by the worker), then
    // archive the local row so the worker can still resolve it during removal.
    await unpublishListing(listing.userId, id);
    await prisma.listing.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });

    const portalLine = hadLivePubs
      ? "\n\nAk bol inzerát zverejnený na portáloch, spustili sme aj jeho stiahnutie z nich."
      : "";
    await notifyUser(listing.userId, {
      title: "Váš inzerát bol odstránený administrátorom",
      body:
        `Inzerát „${listing.title}" bol odstránený administrátorom Klikado.\n\n` +
        `Dôvod: ${reason}` +
        portalLine +
        "\n\nAk si myslíš, že ide o omyl, odpovedz na tento e-mail.",
    });

    return json({ ok: true });
  },
);
