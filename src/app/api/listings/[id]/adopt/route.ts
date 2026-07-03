import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { adoptListing } from "@/lib/publishing";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/listings/:id/adopt — link an ad the user already posted on a portal
// (by its public URL) so Klikado manages it. Body: { portalKey, url }.
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const listing = await prisma.listing.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!listing) throw new HttpError(404, "Inzerát nenájdený");

  const body = (await req.json().catch(() => ({}))) as {
    portalKey?: string;
    url?: string;
  };
  const portalKey = (body.portalKey ?? "").trim();
  const url = (body.url ?? "").trim();
  if (!portalKey) throw new HttpError(400, "Chýba portál");
  if (!/^https?:\/\/.+/i.test(url)) {
    throw new HttpError(400, "Zadaj platný odkaz na inzerát (https://…).");
  }

  await adoptListing(user.id, id, portalKey, url);
  return json({ ok: true }, { status: 202 });
});
