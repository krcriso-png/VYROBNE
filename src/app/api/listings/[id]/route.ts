import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { listingUpdateSchema } from "@/lib/validation";
import { syncListing, unpublishListing } from "@/lib/publishing";
import { normalizePhone } from "@/lib/phone";

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
      phone: data.phone === undefined ? undefined : normalizePhone(data.phone),
      parameters:
        data.parameters === undefined
          ? undefined
          : (data.parameters as Prisma.InputJsonValue),
    },
  });

  // When the auto-topovať interval changes, schedule the next bump relative to
  // when each ad was actually published (so enabling it right after publishing
  // does NOT immediately re-post a minutes-old ad). Disabling clears it.
  if (data.renewIntervalHours !== undefined) {
    const pubs = await prisma.publication.findMany({
      where: { listingId: id, status: "PUBLISHED" },
      select: { id: true, publishedAt: true },
    });
    const hours = data.renewIntervalHours;
    for (const pub of pubs) {
      const base = pub.publishedAt ?? new Date();
      const next =
        hours && hours > 0
          ? new Date(base.getTime() + hours * 60 * 60 * 1000)
          : null;
      await prisma.publication.update({
        where: { id: pub.id },
        data: { nextRefreshAt: next },
      });
    }
  }

  // Only propagate to live portals when actual content changed — a renew-only
  // toggle must not trigger a re-post.
  const CONTENT_FIELDS = [
    "title",
    "description",
    "price",
    "currency",
    "category",
    "parameters",
    "tags",
    "location",
    "zip",
    "contactName",
    "phone",
    "contactEmail",
    "web",
  ] as const;
  const contentChanged = CONTENT_FIELDS.some(
    (k) => (data as Record<string, unknown>)[k] !== undefined,
  );
  if (contentChanged) {
    await syncListing(user.id, id);
  }

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
