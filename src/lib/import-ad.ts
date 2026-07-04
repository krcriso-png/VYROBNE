// ===========================================================================
// Import an existing ad from a portal URL
//
// Fetches a public ad page (Bazoš SK/CZ, Bazar.sk) and extracts title,
// description, price and photos — primarily from OpenGraph meta tags (reliable
// and standard), with portal-aware fallbacks. No headless browser needed: these
// ad pages are server-rendered HTML.
// ===========================================================================

export interface ImportedAd {
  portalKey: "bazos-sk" | "bazos-cz" | "bazar-sk";
  title: string;
  description: string;
  price: number | null;
  currency: string;
  location: string | null;
  imageUrls: string[];
}

/** Which portal a URL belongs to (null = unsupported). */
export function detectPortal(url: string): ImportedAd["portalKey"] | null {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (/(^|\.)bazos\.sk$/.test(host)) return "bazos-sk";
  if (/(^|\.)bazos\.cz$/.test(host)) return "bazos-cz";
  if (/(^|\.)bazar\.sk$/.test(host)) return "bazar-sk";
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** All <meta property|name="prop" content="…"> values (either attribute order). */
function metaAll(html: string, prop: string): string[] {
  const out: string[] = [];
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const propRe = new RegExp(`(?:property|name)\\s*=\\s*["']${prop}["']`, "i");
  for (const tag of tags) {
    if (!propRe.test(tag)) continue;
    const c = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (c) out.push(decodeEntities(c[1]).trim());
  }
  return out;
}
const meta1 = (html: string, prop: string) => metaAll(html, prop)[0] ?? "";

function stripTags(s: string): string {
  return decodeEntities(
    s
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

function absolutize(src: string, base: string): string {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

/** Parse an already-fetched ad page. */
export function parseAd(
  url: string,
  html: string,
  portalKey: ImportedAd["portalKey"],
): ImportedAd {
  const ogTitle = meta1(html, "og:title");
  const ogDesc = meta1(html, "og:description");
  const ogImages = metaAll(html, "og:image").map((s) => absolutize(s, url));

  // Title: OG, else the <h1>/<title>.
  let title = ogTitle;
  if (!title) {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    title = stripTags(h1?.[1] ?? "");
  }
  if (!title) title = stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
  title = title.replace(/\s*[|·-]\s*(Bazoš|Bazar)\.?\w*.*$/i, "").trim();

  // Description: prefer the portal's detail block, else OG description.
  let description = "";
  const descBlock =
    html.match(/<div[^>]*class=["'][^"']*popisdetail[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ??
    html.match(/<div[^>]*class=["'][^"']*(?:popis|description|detail-text)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (descBlock) description = stripTags(descBlock[1]);
  if (description.length < ogDesc.length) description = ogDesc || description;

  // Price: OG product price, else a "Cena … €/Kč" pattern.
  const currencyDefault = portalKey === "bazos-cz" ? "CZK" : "EUR";
  let price: number | null = null;
  let currency = currencyDefault;
  const ogPrice = meta1(html, "product:price:amount") || meta1(html, "og:price:amount");
  if (ogPrice) {
    const n = Number(ogPrice.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0) price = n;
  }
  if (price == null) {
    const text = stripTags(html);
    const m = text.match(/Cena[:\s]*([\d][\d\s.]*)\s*(€|eur|kč|czk)/i);
    if (m) {
      const n = Number(m[1].replace(/[\s.]/g, ""));
      if (Number.isFinite(n) && n > 0) price = n;
      if (/kč|czk/i.test(m[2])) currency = "CZK";
      else currency = "EUR";
    }
  }

  // Location: best-effort ("Lokalita: …" / "PSČ").
  let location: string | null = null;
  const locText = stripTags(html);
  const locM =
    locText.match(/Lokalita[:\s]*([^\n]{2,40})/i) ||
    locText.match(/Mesto[:\s]*([^\n]{2,40})/i);
  if (locM) location = locM[1].replace(/\s{2,}.*$/, "").trim() || null;

  // Photos: OG images + any portal-hosted /img/ photos in the page. Dedupe.
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const imgSet = new Set<string>(ogImages);
  const imgRe = /(?:src|href)\s*=\s*["']((?:https?:)?\/\/[^"']+\.(?:jpe?g|png|webp))["']/gi;
  let im: RegExpExecArray | null;
  while ((im = imgRe.exec(html))) {
    const abs = absolutize(im[1], url);
    // Keep only real ad photos: portal image hosts / an /img/ path; skip logos.
    if (
      /\/(img|images|fotky|fotka|photo)\//i.test(abs) &&
      !/(logo|sprite|icon|favicon|avatar|placeholder)/i.test(abs) &&
      (abs.includes(host.split(".").slice(-2).join(".")) || /aimg\.sk|bazos|bazar/i.test(abs))
    ) {
      imgSet.add(abs);
    }
  }
  const imageUrls = Array.from(imgSet).slice(0, 12);

  return {
    portalKey,
    title: title.slice(0, 180),
    description: (description || title).slice(0, 8000),
    price,
    currency,
    location,
    imageUrls,
  };
}

/** Fetch + parse an ad URL. Throws a friendly error on unsupported/failed. */
export async function importAdFromUrl(url: string): Promise<ImportedAd> {
  const portalKey = detectPortal(url);
  if (!portalKey) {
    throw new Error(
      "Zatiaľ podporujeme import len z Bazoš SK, Bazoš CZ a Bazar.sk. Vlož odkaz na inzerát z týchto portálov.",
    );
  }
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
      "accept-language": "sk,cs;q=0.9",
    },
    redirect: "follow",
  }).catch(() => null);
  if (!res || !res.ok) {
    throw new Error(
      "Odkaz sa nepodarilo načítať. Skontroluj, či je verejne dostupný, a skús to znova.",
    );
  }
  const html = await res.text();
  const ad = parseAd(res.url || url, html, portalKey);
  if (!ad.title) {
    throw new Error(
      "Z odkazu sa nepodarilo prečítať inzerát (možno vyžaduje prihlásenie alebo má iný formát). Skús ho pridať ručne.",
    );
  }
  return ad;
}
