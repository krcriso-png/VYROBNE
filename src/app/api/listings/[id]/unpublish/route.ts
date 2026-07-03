import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { unpublishListing } from "@/lib/publishing";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/listings/:id/unpublish — remove the listing from a portal (or all
// portals when portalId is omitted). Enqueues a delete job per live portal;
// the provider deletes the ad using the stored per-ad password / session.
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const listing = await prisma.listing.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!listing) throw new HttpError(404, "Inzerát nenájdený");

  let portalId: string | undefined;
  try {
    const body = (await req.json()) as { portalId?: string };
    portalId = body?.portalId;
  } catch {
    /* no body — remove from all portals */
  }

  await unpublishListing(user.id, id, portalId);
  return json({ ok: true }, { status: 202 });
});
