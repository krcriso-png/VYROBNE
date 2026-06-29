import { route, json, requireUser, HttpError } from "@/lib/api";
import { generateListingText, aiConfigured } from "@/lib/ai";
import { hasCredits, spendCredits } from "@/lib/credits";

// POST /api/ai/generate — generate ad title/description/price from a photo
// and/or a short hint. Body: { imageBase64?, imageMediaType?, hint?, category? }.
// Costs 1 credit (only charged on success).
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  if (!aiConfigured()) {
    throw new HttpError(
      503,
      "AI generovanie momentálne nie je dostupné. Skús to neskôr.",
    );
  }

  const body = (await req.json()) as {
    imageBase64?: string;
    imageMediaType?: string;
    hint?: string;
    category?: string;
  };

  if (!body.imageBase64 && !body.hint?.trim()) {
    throw new HttpError(
      400,
      "Pridaj fotku alebo napíš pár slov o predmete, nech mám z čoho vychádzať.",
    );
  }

  if (!(await hasCredits(user.id, 1))) {
    throw new HttpError(
      402,
      "Na AI generovanie nemáš dostatok kreditov. Doplň ich v sekcii Predplatné.",
    );
  }

  const result = await generateListingText({
    imageBase64: body.imageBase64,
    imageMediaType: body.imageMediaType,
    hint: body.hint,
    category: body.category,
  });

  // Charge only after a successful generation.
  await spendCredits(user.id, 1, "ai_generovanie").catch(() => undefined);

  return json(result);
});
