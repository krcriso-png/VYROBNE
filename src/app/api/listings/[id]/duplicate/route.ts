import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/listings/:id/duplicate — clone a listing (content + images) as a
// new DRAFT. Publications are intentionally not copied.
export const POST = route(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const source = await prisma.listing.findFirst({
    where: { id, userId: user.id },
    include: { images: true },
  });
  if (!source) throw new HttpError(404, "Inzerát nenájdený");

  const copy = await prisma.listing.create({
    data: {
      userId: user.id,
      status: "DRAFT",
      title: `${source.title} (kópia)`,
      description: source.description,
      price: source.price,
      currency: source.currency,
      category: source.category,
      parameters: source.parameters ?? {},
      tags: source.tags,
      location: source.location,
      zip: source.zip,
      contactName: source.contactName,
      phone: source.phone,
      contactEmail: source.contactEmail,
      web: source.web,
      renewIntervalHours: source.renewIntervalHours,
      images: {
        create: source.images.map((img) => ({
          key: img.key,
          thumbKey: img.thumbKey,
          url: img.url,
          width: img.width,
          height: img.height,
          bytes: img.bytes,
          mimeType: img.mimeType,
          position: img.position,
          isMain: img.isMain,
        })),
      },
    },
  });

  return json({ listing: copy }, { status: 201 });
});
