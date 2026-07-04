import { route, json, requireUser, HttpError } from "@/lib/api";
import { importListingFromUrl } from "@/lib/publishing";

// POST /api/listings/import { url } — create a listing from an existing portal
// ad (scrape title/description/price/photos) and adopt it under management.
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  const clean = (url ?? "").trim();
  if (!/^https?:\/\/.+/i.test(clean)) {
    throw new HttpError(400, "Vlož platný odkaz na inzerát (https://…).");
  }
  try {
    const listingId = await importListingFromUrl(user.id, clean);
    return json({ listingId }, { status: 201 });
  } catch (e) {
    throw new HttpError(422, e instanceof Error ? e.message : "Import zlyhal.");
  }
});
