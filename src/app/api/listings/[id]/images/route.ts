import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { processAndStore } from "@/lib/images";

interface Params {
  params: Promise<{ id: string }>;
}

const MAX_FILES = 20;
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per file

// POST /api/listings/:id/images — multipart upload of one or more photos.
// Each file is resized, compressed and converted to WebP before storage.
export const POST = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const listing = await prisma.listing.findFirst({
    where: { id, userId: user.id },
    include: { _count: { select: { images: true } } },
  });
  if (!listing) throw new HttpError(404, "Inzerát nenájdený");

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new HttpError(400, "Žiadne súbory");
  if (files.length > MAX_FILES) throw new HttpError(400, "Príliš veľa súborov");

  let position = listing._count.images;
  const created = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) throw new HttpError(413, `${file.name} je príliš veľký`);
    const buffer = Buffer.from(await file.arrayBuffer());
    const processed = await processAndStore(user.id, buffer);
    const image = await prisma.listingImage.create({
      data: {
        listingId: id,
        key: processed.key,
        thumbKey: processed.thumbKey,
        url: processed.url,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
        mimeType: processed.mimeType,
        position,
        isMain: position === 0, // first image becomes the main photo
      },
    });
    created.push(image);
    position += 1;
  }

  return json({ images: created }, { status: 201 });
});

// PATCH /api/listings/:id/images — reorder / set main photo.
// Body: { order: string[] } where order is image ids, first = main.
export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const listing = await prisma.listing.findFirst({
    where: { id, userId: user.id },
  });
  if (!listing) throw new HttpError(404, "Inzerát nenájdený");

  const { order } = (await req.json()) as { order: string[] };
  await prisma.$transaction(
    order.map((imageId, index) =>
      prisma.listingImage.update({
        where: { id: imageId },
        data: { position: index, isMain: index === 0 },
      }),
    ),
  );
  return json({ ok: true });
});

// DELETE /api/listings/:id/images — remove one photo. Body: { imageId }.
// Positions are re-normalized so the first remaining photo becomes the main one.
export const DELETE = route(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const listing = await prisma.listing.findFirst({
    where: { id, userId: user.id },
  });
  if (!listing) throw new HttpError(404, "Inzerát nenájdený");

  const { imageId } = (await req.json().catch(() => ({}))) as {
    imageId?: string;
  };
  if (!imageId) throw new HttpError(400, "Chýba fotka");

  await prisma.listingImage.deleteMany({
    where: { id: imageId, listingId: id },
  });

  // Re-pack positions (0,1,2,…) and keep the first photo as main.
  const rest = await prisma.listingImage.findMany({
    where: { listingId: id },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  await prisma.$transaction(
    rest.map((img, index) =>
      prisma.listingImage.update({
        where: { id: img.id },
        data: { position: index, isMain: index === 0 },
      }),
    ),
  );
  return json({ ok: true });
});
