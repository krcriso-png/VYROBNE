import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { unpublishListing } from "@/lib/publishing";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/listings/:id/unpublish — remove the listing from ONE portal
// (portalKey given) or from ALL portals (no body). Enqueues a delete job per
// live portal; the provider deletes the ad using the stored per-ad password /
// session. The listing itself stays in Klikado for later re-publishing.
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const listing = await prisma.listing.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!listing) throw new HttpError(404, "Inzerát nenájdený");

  let portalKey: string | undefined;
  try {
    const body = (await req.json()) as { portalKey?: string };
    portalKey = body?.portalKey;
  } catch {
    /* no body — remove from all portals */
  }

  await unpublishListing(user.id, id, portalKey);
  return json({ ok: true }, { status: 202 });
});
