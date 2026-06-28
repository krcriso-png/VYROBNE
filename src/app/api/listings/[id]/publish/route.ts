import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { publishSchema } from "@/lib/validation";
import { publishListing } from "@/lib/publishing";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/listings/:id/publish — publish to the selected portals.
// Body: { portalKeys: string[] }. Enqueues async publish jobs and returns
// immediately; clients poll GET /api/listings/:id for per-portal status.
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const { portalKeys } = publishSchema.parse(await req.json());

  const listing = await prisma.listing.findFirst({
    where: { id, userId: user.id },
  });
  if (!listing) throw new HttpError(404, "Inzerát nenájdený");

  await publishListing(user.id, id, portalKeys);
  return json({ ok: true, queued: portalKeys.length }, { status: 202 });
});
