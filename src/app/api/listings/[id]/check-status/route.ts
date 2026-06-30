import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { recheckListing } from "@/lib/publishing";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/listings/:id/check-status — manually re-verify the listing's
// status on every portal (opens "Moje inzeráty" by e-mail + phone). Free.
export const POST = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const listing = await prisma.listing.findFirst({
    where: { id, userId: user.id },
  });
  if (!listing) throw new HttpError(404, "Inzerát nenájdený");

  const queued = await recheckListing(user.id, id);
  return json({ ok: true, queued }, { status: 202 });
});
