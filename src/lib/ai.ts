import Anthropic from "@anthropic-ai/sdk";

// ===========================================================================
// AI ad-copy generation (Claude)
//
// Turns a photo and/or a short hint into a ready-to-publish classified ad:
// a catchy title, a structured Slovak description, and a rough price estimate.
// Uses the fast, low-cost Haiku model with vision + structured JSON output so
// the result drops straight into the listing form for a fraction of a cent.
// ===========================================================================

// Model used for ad-copy generation. Defaults to the cheapest capable Claude
// model (Haiku 4.5) for this simple vision→JSON task. It can be overridden per
// deployment with the AI_MODEL environment variable (e.g. in Railway) WITHOUT a
// code change — set AI_MODEL=claude-sonnet-5 for higher quality, or leave it
// unset for the cheapest option. Note: we intentionally do NOT send the `effort`
// parameter, so any current model (incl. Haiku, which rejects effort) works.
const MODEL = process.env.AI_MODEL?.trim() || "claude-haiku-4-5";

export interface GeneratedListing {
  title: string;
  description: string;
  price: number; // 0 = unknown / "Dohodou"
}

export interface GenerateInput {
  /** Base64 image data (no data: prefix) of the main photo, if available. */
  imageBase64?: string;
  imageMediaType?: string; // e.g. "image/jpeg"
  /** A few words from the user about the item (optional). */
  hint?: string;
  /** Chosen Bazoš category label, to steer tone (optional). */
  category?: string;
}

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM = `Si skúsený slovenský copywriter pre inzeráty na Bazoš.sk.
Z fotky a/alebo krátkeho popisu vytvoríš lákavý, dôveryhodný inzerát v slovenčine.
Zásady:
- Názov: výstižný, max ~60 znakov, bez zbytočných emoji a CAPS LOCKu.
- Popis: 3–6 viet, prirodzená slovenčina. Spomeň stav, kľúčové vlastnosti a krátku výzvu na kontakt. Nevymýšľaj si fakty, ktoré nevidíš — píš všeobecne, ak nevieš detail.
- Cena: odhad v eurách ako číslo. Ak sa nedá odhadnúť, daj 0.
- Nepoužívaj telefónne čísla ani odkazy.`;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Krátky názov inzerátu" },
    description: { type: "string", description: "Popis inzerátu v slovenčine" },
    price: {
      type: "number",
      description: "Odhad ceny v EUR, 0 ak neznáme",
    },
  },
  required: ["title", "description", "price"],
  additionalProperties: false,
} as const;

export async function generateListingText(
  input: GenerateInput,
): Promise<GeneratedListing> {
  if (!aiConfigured()) {
    throw new Error(
      "AI generovanie nie je nakonfigurované (chýba ANTHROPIC_API_KEY).",
    );
  }
  const client = new Anthropic();

  const parts: Anthropic.ContentBlockParam[] = [];
  if (input.imageBase64) {
    parts.push({
      type: "image",
      source: {
        type: "base64",
        media_type: (input.imageMediaType ?? "image/jpeg") as
          | "image/jpeg"
          | "image/png"
          | "image/webp"
          | "image/gif",
        data: input.imageBase64,
      },
    });
  }
  const ask: string[] = ["Vytvor inzerát na Bazoš."];
  if (input.category) ask.push(`Kategória: ${input.category}.`);
  if (input.hint) ask.push(`Doplňujúci popis od predajcu: ${input.hint}`);
  if (!input.imageBase64) {
    ask.push("Fotka nie je k dispozícii — vychádzaj z popisu.");
  }
  parts.push({ type: "text", text: ask.join(" ") });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    output_config: {
      format: { type: "json_schema", schema: SCHEMA },
    },
    messages: [{ role: "user", content: parts }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("AI nevrátila text.");
  }
  const parsed = JSON.parse(text.text) as GeneratedListing;
  return {
    title: String(parsed.title ?? "").slice(0, 160),
    description: String(parsed.description ?? ""),
    price:
      typeof parsed.price === "number" && parsed.price > 0 ? parsed.price : 0,
  };
}
