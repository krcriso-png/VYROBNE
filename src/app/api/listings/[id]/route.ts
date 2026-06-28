import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { listingUpdateSchema } from "@/lib/validation";
import { syncListing, unpublishListing } from "@/lib/publishing";

interface Params {
  params: Promise<{ id: string }>;
}

async function ownedListing(userId: string, id: string) {
  const listing = await prisma.listing.findFirst({ where: { id, userId } });
  if (!listing) throw new HttpError(404, "Inzerát nenájdený");
  return listing;
}

// GET /api/listings/:id — full listing with images and per-portal status.
export const GET = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await ownedListing(user.id, id);
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      images: { orderBy: { position: "asc" } },
      publications: { include: { portal: true } },
    },
  });
  return json({ listing });
});

// PATCH /api/listings/:id — edit. Changes are automatically synced to every
// portal the listing is already live on (price/description/photos/phone…).
export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await ownedListing(user.id, id);
  const data = listingUpdateSchema.parse(await req.json());

  const listing = await prisma.listing.update({
    where: { id },
    data: {
      ...data,
      parameters:
        data.parameters === undefined
          ? undefined
          : (data.parameters as Prisma.InputJsonValue),
    },
  });

  // Fire-and-forget propagation to live portals.
  await syncListing(user.id, id);

  return json({ listing });
});

// DELETE /api/listings/:id — remove from all portals, then delete locally.
export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  await ownedListing(user.id, id);

  // Schedule removal from portals first; the local row is archived so the
  // worker can still resolve it. Hard-delete happens after removal jobs run.
  await unpublishListing(user.id, id);
  await prisma.listing.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });

  return json({ ok: true });
});
