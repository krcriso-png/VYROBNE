import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { listingInputSchema } from "@/lib/validation";
import { canAddActiveListing } from "@/lib/plans";
import { normalizePhone } from "@/lib/phone";

// GET /api/listings — list the current user's listings (with summary counts).
export const GET = route(async () => {
  const user = await requireUser();
  const listings = await prisma.listing.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      images: { where: { isMain: true }, take: 1 },
      _count: { select: { publications: true } },
    },
  });
  return json({ listings });
});

// POST /api/listings — create a new listing (enforces plan limits).
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const data = listingInputSchema.parse(await req.json());

  const sub = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });
  const plan = sub?.plan ?? "FREE";
  const activeCount = await prisma.listing.count({
    where: { userId: user.id, status: "ACTIVE" },
  });
  if (!canAddActiveListing(plan, activeCount)) {
    throw new HttpError(
      402,
      "Dosiahnutý limit aktívnych inzerátov pre váš plán",
    );
  }

  const listing = await prisma.listing.create({
    data: {
      userId: user.id,
      title: data.title,
      description: data.description,
      price: data.price ?? null,
      currency: data.currency,
      category: data.category,
      parameters: data.parameters as Prisma.InputJsonValue,
      tags: data.tags,
      location: data.location ?? null,
      zip: data.zip ?? null,
      contactName: data.contactName ?? null,
      phone: normalizePhone(data.phone),
      contactEmail: data.contactEmail ?? null,
      web: data.web ?? null,
      renewIntervalHours: data.renewIntervalHours ?? null,
    },
  });
  return json({ listing }, { status: 201 });
});
