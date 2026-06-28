import { BrowserProvider } from "../base";
import type {
  ProviderContext,
  ProviderCredentials,
  ProviderSession,
  ListingPayload,
  PublishResult,
  StatusResult,
} from "../types";

// ===========================================================================
// Bazoš SK (browser automation)
//
// Bazoš has no official API, so we drive the public web flow with Playwright.
// This module captures the *shape* of a real integration: login → fill form →
// upload photos → submit → capture the resulting listing URL/ID. Selectors are
// centralised below so they can be tweaked in one place when the site changes
// (resilience requirement). Real selectors must be verified against the live
// site and the integration must respect the portal's Terms of Service and
// rate limits.
//
// NOTE: The step bodies below are intentionally written as a documented
// reference flow. Replace the `TODO` selector work with verified selectors and
// enable in the registry once tested against the live site.
// ===========================================================================

const BASE_URL = "https://www.bazos.sk";

const SELECTORS = {
  loginEmail: 'input[name="login"]',
  loginPassword: 'input[name="heslo"]',
  loginSubmit: 'input[type="submit"][value*="Prihl"]',
  // Add-listing form fields
  title: 'input[name="nadpis"]',
  description: 'textarea[name="popis"]',
  price: 'input[name="cena"]',
  zip: 'input[name="psc"]',
  email: 'input[name="maileditx"]',
  phone: 'input[name="telefoni"]',
  fileInput: 'input[type="file"]',
  submit: 'input[type="submit"][value*="Pridat"]',
};

export class BazosSkProvider extends BrowserProvider {
  // Explicit `string` annotations (not inferred literals) so related portals
  // like Bazoš CZ can subclass and override these values.
  readonly key: string = "bazos-sk";
  readonly name: string = "Bazoš SK";
  readonly country: string = "SK";
  readonly supportsRefresh = true;

  protected baseUrl = BASE_URL;

  async login(
    _credentials: ProviderCredentials,
    ctx: ProviderContext,
  ): Promise<ProviderSession> {
    // DISCOVERY MODE: Bazoš has no classic login before posting (you use the
    // "Pridať inzerát" flow). Until the live flow is fully mapped, this step
    // dismisses the cookie banner and records the real page structure
    // (screenshots + links + form fields) so the publish/category/import flows
    // can be implemented against the actual DOM.
    return this.withContext(null, ctx, async (context) => {
      const page = await context.newPage();
      await ctx.log(`Mapujem ${this.name}…`);
      await page.goto(`${this.baseUrl}/`, { waitUntil: "domcontentloaded" });
      await this.acceptCookies(page, ctx);
      await this.debugShot(page, ctx, "home");
      await this.logStructure(page, ctx);

      // Open the add-listing flow and record what it looks like.
      try {
        await page
          .getByText("Pridať inzerát", { exact: false })
          .first()
          .click({ timeout: 8000 });
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(800);
        await this.debugShot(page, ctx, "pridat-inzerat");
        await this.logStructure(page, ctx);
      } catch (e) {
        await ctx.log("Nepodarilo sa otvoriť 'Pridať inzerát': " + String(e));
      }

      // Record the category map (source for category import).
      try {
        await page.goto(`${this.baseUrl}/mapa.php`, {
          waitUntil: "domcontentloaded",
        });
        await page.waitForTimeout(500);
        await this.debugShot(page, ctx, "mapa-kategorii");
        await this.logStructure(page, ctx);
      } catch (e) {
        await ctx.log("Mapa kategórií nedostupná: " + String(e));
      }

      const session = await this.snapshot(context);
      return {
        ...session,
        validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      };
    });
  }

  async publish(
    listing: ListingPayload,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<PublishResult> {
    return this.withContext(session, ctx, async (context) => {
      const page = await context.newPage();

      // Step 1 — sections are subdomains with stable keys (auto, dom, pc, …).
      // Map the listing category to a section and go straight to its add page.
      const wanted =
        (listing.parameters?.["bazosCategory"] as string | undefined) ??
        listing.category;
      const sectionKey = matchSectionKey(wanted);
      const sectionUrl = `https://${sectionKey}.bazos.sk/pridat-inzerat.php`;
      await ctx.log(`Sekcia "${wanted}" → ${sectionKey} (${sectionUrl})`);
      await page.goto(sectionUrl, { waitUntil: "domcontentloaded" });
      await this.acceptCookies(page, ctx);
      await this.debugShot(page, ctx, "section-add");
      await this.logStructure(page, ctx);

      // Step 2 — choose a sub-category on the section's add page if the form is
      // not shown yet (Bazoš requires choosing one before the form appears).
      const hasTitle = async () =>
        (await page.locator(SELECTORS.title).count()) > 0;

      if (!(await hasTitle())) {
        const sub = await clickBestSubcategory(page, ctx, wanted, sectionKey);
        if (sub) {
          await page.waitForLoadState("domcontentloaded").catch(() => {});
          await page.waitForTimeout(900);
          await this.debugShot(page, ctx, "after-subcat");
          await this.logStructure(page, ctx);
        }
      }

      // Step 3 — some flows land on the sub-category listing page; click its
      // "Pridať inzerát" to reach the actual form.
      if (!(await hasTitle())) {
        try {
          await page
            .getByText("Pridať inzerát", { exact: false })
            .first()
            .click({ timeout: 6000 });
          await page.waitForLoadState("domcontentloaded").catch(() => {});
          await page.waitForTimeout(900);
          await this.debugShot(page, ctx, "after-pridat");
          await this.logStructure(page, ctx);
        } catch {
          /* no such link */
        }
      }

      if (!(await hasTitle())) {
        throw new Error(
          "Stále nie je pole 'nadpis' — pozri screenshoty 'section-add'/'after-subcat'/'after-pridat' a POLIA v logoch.",
        );
      }

      await ctx.log("Vypĺňam formulár inzerátu");
      await page.fill(SELECTORS.title, listing.title);
      await page.fill(SELECTORS.description, listing.description);
      if (listing.price != null) {
        await page.fill(SELECTORS.price, String(listing.price));
      }
      if (listing.zip) await page.fill(SELECTORS.zip, listing.zip);
      if (listing.email) await page.fill(SELECTORS.email, listing.email);
      if (listing.phone) await page.fill(SELECTORS.phone, listing.phone);

      // Photos: download from storage then set on the file input.
      if (listing.images.length > 0) {
        await ctx.log("Nahrávam fotky", { count: listing.images.length });
        const files = await downloadImages(listing.images);
        await page.setInputFiles(SELECTORS.fileInput, files);
      }

      await Promise.all([
        page.waitForLoadState("networkidle"),
        page.click(SELECTORS.submit),
      ]);

      const remoteUrl = page.url();
      const remoteId = extractIdFromUrl(remoteUrl) ?? remoteUrl;
      await ctx.log("Publikované", { remoteId, remoteUrl });

      return { remoteId, remoteUrl, session: await this.snapshot(context) };
    });
  }

  async refresh(
    remoteId: string,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<void> {
    await this.withContext(session, ctx, async (context) => {
      const page = await context.newPage();
      // TODO: navigate to the "topovať / posunúť" action for `remoteId`.
      await ctx.log("Refresh (bump) listing", { remoteId });
      await page.goto(`${this.baseUrl}/`, { waitUntil: "domcontentloaded" });
    });
  }

  async delete(
    remoteId: string,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<void> {
    await this.withContext(session, ctx, async (context) => {
      const page = await context.newPage();
      await ctx.log("Delete listing", { remoteId });
      // TODO: navigate to the manage page and confirm deletion.
      await page.goto(`${this.baseUrl}/`, { waitUntil: "domcontentloaded" });
    });
  }

  async checkStatus(
    remoteId: string,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<StatusResult> {
    return this.withContext(session, ctx, async (context) => {
      const page = await context.newPage();
      const url = remoteId.startsWith("http")
        ? remoteId
        : `${this.baseUrl}/inzerat/${remoteId}`;
      const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
      const live = !!resp && resp.status() < 400;
      await ctx.log("Status check", { remoteId, live });
      return { live, remoteUrl: url };
    });
  }
}

// --- helpers ---------------------------------------------------------------

/** Normalise text for matching: lowercase, strip diacritics. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Count shared significant words between two normalised strings. */
function wordOverlap(a: string, b: string): number {
  const wa = new Set(a.split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const wb = b.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  let n = 0;
  for (const w of wb) if (wa.has(w)) n++;
  return n;
}

// Bazoš main sections — each is a subdomain whose key matches the "rubriky"
// select values. Used to route a listing to the right section's add page.
const SECTIONS: { key: string; label: string }[] = [
  { key: "auto", label: "Auto" },
  { key: "reality", label: "Reality" },
  { key: "praca", label: "Práca" },
  { key: "zvierata", label: "Zvieratá" },
  { key: "deti", label: "Deti detský bazár" },
  { key: "dom", label: "Dom a záhrada byt" },
  { key: "pc", label: "PC počítače notebooky" },
  { key: "mobil", label: "Mobily telefóny" },
  { key: "foto", label: "Foto fotoaparáty" },
  { key: "elektro", label: "Elektro chladnička práčka televízor" },
  { key: "stroje", label: "Stroje náradie" },
  { key: "motorky", label: "Motocykle motorky skútre" },
  { key: "sport", label: "Šport bicykle" },
  { key: "hudba", label: "Hudba nástroje" },
  { key: "knihy", label: "Knihy učebnice" },
  { key: "nabytok", label: "Nábytok" },
  { key: "oblecenie", label: "Oblečenie obuv šperky hodinky" },
  { key: "sluzby", label: "Služby" },
  { key: "vstupenky", label: "Vstupenky" },
  { key: "ostatne", label: "Ostatné" },
];

/** Map a free-text category to the best Bazoš section key (fallback ostatne). */
function matchSectionKey(category: string): string {
  const w = norm(category);
  let best = "ostatne";
  let bestScore = 0;
  for (const s of SECTIONS) {
    const score = wordOverlap(norm(s.label), w);
    if (score > bestScore) {
      bestScore = score;
      best = s.key;
    }
  }
  return best;
}

/**
 * On a section's add page, pick the sub-category best matching the listing and
 * navigate straight to that sub-category's add form
 * (https://<section>.bazos.sk/<slug>/pridat-inzerat.php). Returns the slug or
 * null if no sub-category links were found.
 */
async function clickBestSubcategory(
  page: import("playwright").Page,
  ctx: ProviderContext,
  wanted: string,
  sectionKey: string,
): Promise<string | null> {
  const host = `${sectionKey}.bazos.sk`;
  const exclude = /^(oblubene|moje-inzeraty|pridat-inzerat|prihlasit|registracia|podmienky|pomoc|otazky|hodnotenie|kontakt|reklama|ochrana-udajov|rss|mapa)/i;

  const links = await page.$$eval(
    "a",
    (as, h) =>
      as
        .map((a) => {
          const el = a as HTMLAnchorElement;
          let path = "";
          try {
            const u = new URL(el.href);
            if (u.host === h) path = u.pathname;
          } catch {
            /* ignore */
          }
          return { text: (a.textContent ?? "").trim(), path };
        })
        .filter((l) => l.text && /^\/[a-z0-9-]+\/$/i.test(l.path)),
    host,
  );

  const subs = links.filter((l) => !exclude.test(l.path.replace(/^\//, "")));
  if (subs.length === 0) return null;

  const w = norm(wanted);
  let best = subs[0];
  let bestScore = -1;
  for (const l of subs) {
    const score = wordOverlap(norm(l.text), w);
    if (score > bestScore) {
      bestScore = score;
      best = l;
    }
  }

  const slug = best.path.replace(/^\/|\/$/g, "");
  await ctx.log(`Podkategória → ${best.text} (${best.path})`);
  // Click the real link rather than guessing an add URL.
  try {
    await page.click(`a[href$="${best.path}"]`, { timeout: 6000 });
  } catch {
    // Fall back to navigating to the subcategory page directly.
    await page.goto(`https://${host}${best.path}`, {
      waitUntil: "domcontentloaded",
    });
  }
  return slug;
}

async function downloadImages(
  images: ListingPayload["images"],
): Promise<{ name: string; mimeType: string; buffer: Buffer }[]> {
  const ordered = [...images].sort((a, b) => a.position - b.position);
  const out: { name: string; mimeType: string; buffer: Buffer }[] = [];
  for (const [i, img] of ordered.entries()) {
    const res = await fetch(img.url);
    const buffer = Buffer.from(await res.arrayBuffer());
    out.push({
      name: `photo-${i}.webp`,
      mimeType: res.headers.get("content-type") ?? "image/webp",
      buffer,
    });
  }
  return out;
}

function extractIdFromUrl(url: string): string | null {
  const m = url.match(/(\d{6,})/);
  return m ? m[1] : null;
}
