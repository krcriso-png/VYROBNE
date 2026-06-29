import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { refreshListing } from "@/lib/publishing";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/listings/:id/refresh — "topovať": re-post the listing on every
// portal it's live on (delete + publish again), staggered to avoid blocking.
export const POST = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const listing = await prisma.listing.findFirst({
    where: { id, userId: user.id },
  });
  if (!listing) throw new HttpError(404, "Inzerát nenájdený");

  const queued = await refreshListing(user.id, id);
  return json({ ok: true, queued }, { status: 202 });
});
