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

      // Navigate the real add-listing flow: homepage → cookies → "Pridať
      // inzerát". The form fields only appear after this, so we capture the
      // page structure here on every attempt for reliable diagnostics.
      await page.goto(`${this.baseUrl}/`, { waitUntil: "domcontentloaded" });
      await this.acceptCookies(page, ctx);
      try {
        await page
          .getByText("Pridať inzerát", { exact: false })
          .first()
          .click({ timeout: 10000 });
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(800);
      } catch (e) {
        await ctx.log("Nenašiel som 'Pridať inzerát': " + String(e));
      }
      await this.debugShot(page, ctx, "add-form");
      await this.logStructure(page, ctx);

      // If the title field isn't present yet, a category/section must be picked
      // first — stop with a clear message; the screenshot + POLIA log above
      // show exactly what the page offers so the flow can be finished.
      if ((await page.locator(SELECTORS.title).count()) === 0) {
        throw new Error(
          "Formulár ešte nemá pole 'nadpis' — na Bazoši treba najprv vybrať sekciu/kategóriu. Diagnostika (screenshot 'add-form' + POLIA) je v logoch.",
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
