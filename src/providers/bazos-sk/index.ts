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

      // Step 4 — Bazoš may require SMS phone verification before the form.
      // Handle it with the user in the loop (they enter the code in Klikado).
      if (await page.locator('input[name="teloverit"]').count()) {
        await this.handleSmsVerification(page, ctx, listing);
      }

      if (!(await hasTitle())) {
        throw new Error(
          "Stále nie je pole 'nadpis' — pozri screenshoty 'section-add'/'after-subcat'/'after-pridat'/'sms-*' a POLIA v logoch.",
        );
      }

      // Real Bazoš add-form field names (verified from the live form).
      await ctx.log("Vypĺňam formulár inzerátu");
      await page.fill('input[name="nadpis"]', listing.title);
      await page.fill('textarea[name="popis"]', listing.description);

      // Sub-category dropdown (required) — pick the best matching option.
      await selectBestCategoryOption(page, ctx, wanted);

      if (listing.price != null) {
        await page.fill('input[name="cena"]', String(listing.price));
      } else {
        // No fixed price → "Dohodou".
        await page.selectOption('select[name="cenavyber"]', "2").catch(() => {});
      }

      const loc = listing.zip || listing.location;
      if (loc) await page.fill('input[name="lokalita"]', loc).catch(() => {});
      if (listing.contactName) {
        await page.fill('input[name="jmeno"]', listing.contactName).catch(() => {});
      }
      if (listing.phone) {
        await page.fill('input[name="telefoni"]', listing.phone).catch(() => {});
      }
      if (listing.email) {
        await page.fill('input[name="maili"]', listing.email).catch(() => {});
      }
      // Per-ad password (lets us — and the user — edit/delete the ad later).
      const adPass = ctx.secrets?.password || "Klikado1234";
      await page.fill('input[name="heslobazar"]', adPass).catch(() => {});

      // Photos.
      if (listing.images.length > 0) {
        await ctx.log("Nahrávam fotky", { count: listing.images.length });
        const files = await downloadImages(listing.images);
        await page
          .locator('form:has(input[name="nadpis"]) input[type="file"]')
          .first()
          .setInputFiles(files)
          .catch(() => page.setInputFiles('input[type="file"]', files));
      }

      await this.debugShot(page, ctx, "form-filled");

      // Submit the add form (its submit button, not the search one).
      await page
        .locator('form:has(input[name="nadpis"]) input[type="submit"]')
        .first()
        .click({ timeout: 10000 })
        .catch(() => page.click('input[name="Submit"]'));
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(1500);
      await this.debugShot(page, ctx, "after-submit");
      await this.logStructure(page, ctx);

      // Bazoš usually shows a preview; click the final confirm if present.
      for (const label of [
        "Vložiť inzerát",
        "Pridať inzerát",
        "Pridať",
        "Vložiť",
        "Potvrdiť",
        "Odoslať inzerát",
      ]) {
        const btn = page
          .getByRole("button", { name: new RegExp(`^${label}$`, "i") })
          .first();
        if (await btn.count()) {
          await ctx.log(`Potvrdzujem náhľad → ${label}`);
          await btn.click().catch(() => {});
          await page.waitForLoadState("domcontentloaded").catch(() => {});
          await page.waitForTimeout(1500);
          break;
        }
      }
      await this.debugShot(page, ctx, "after-confirm");
      await this.logStructure(page, ctx);

      // Only report success if we can see a real, live ad.
      const url = page.url();
      const body = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      const idMatch = url.match(/\/inzerat\/(\d+)/);
      const live =
        !!idMatch ||
        /bol pridan|úspešne|zverejnen|inzerát.*(pridan|aktiv)/i.test(body);
      if (!live) {
        const hint = body.replace(/\s+/g, " ").slice(0, 300);
        throw new Error(
          `Bazoš nepotvrdil zverejnenie inzerátu — pravdepodobne chýba povinné pole alebo je krok navyše. Pozri screenshot 'after-confirm'. Text stránky: ${hint}`,
        );
      }

      const remoteUrl = url;
      const remoteId = idMatch ? idMatch[1] : url;
      await ctx.log("Inzerát zverejnený ✅", { remoteId, remoteUrl });
      return { remoteId, remoteUrl, session: await this.snapshot(context) };
    });
  }

  /**
   * Handle Bazoš's pre-posting SMS phone verification with the user in the
   * loop: enter the phone, trigger the SMS, ask the user for the code via
   * ctx.requestUserInput, then submit it. After a successful verification the
   * captured session usually skips this step on future posts.
   */
  private async handleSmsVerification(
    page: import("playwright").Page,
    ctx: ProviderContext,
    listing: ListingPayload,
  ): Promise<void> {
    const phone = (listing.phone ?? "").replace(/[^\d+]/g, "");
    if (!phone) {
      throw new Error(
        "Bazoš vyžaduje overenie telefónu, ale inzerát nemá telefónne číslo.",
      );
    }
    await ctx.log("Spúšťam overenie telefónu na Bazoši");

    // Enter phone, agree to terms, trigger the verification.
    await page.fill('input[name="teloverit"]', phone);
    await page.locator('input[name="podminky"]').check().catch(() => {});
    await this.debugShot(page, ctx, "sms-phone");
    await page
      .locator('form:has(input[name="teloverit"]) input[type="submit"]')
      .first()
      .click({ timeout: 8000 })
      .catch(() => page.click('input[type="submit"]'));
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(1500);

    // Only wait for a code if Bazoš actually shows the code field (`klic`).
    // If the phone is already verified, it goes straight to the form — no SMS.
    const codeField = page.locator('input[name="klic"]');
    if ((await codeField.count()) === 0) {
      await ctx.log("SMS kód nebol vyžiadaný (telefón už overený) — pokračujem");
      return;
    }

    await this.debugShot(page, ctx, "sms-code-page");
    if (!ctx.requestUserInput) {
      throw new Error("SMS overenie vyžaduje interaktívne zadanie kódu.");
    }
    const code = await ctx.requestUserInput(
      "Zadaj SMS kód (mobilný kľúč) z Bazoš, ktorý ti prišiel na telefón.",
    );
    if (!code) {
      throw new Error("SMS kód nebol zadaný včas — skús publikovať znova.");
    }

    await codeField.fill(code);
    await page
      .locator('form:has(input[name="klic"]) input[type="submit"]')
      .first()
      .click({ timeout: 8000 })
      .catch(() => page.click('input[type="submit"]'));
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(1500);
    await this.debugShot(page, ctx, "after-sms");

    // Persist the now-verified session so future posts skip SMS entirely.
    try {
      await ctx.saveSession?.({ state: await page.context().storageState() });
    } catch {
      /* non-fatal */
    }
    await ctx.log("Telefón overený ✅ (relácia uložená)");
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
  { key: "deti", label: "Deti detský bazár hračky bábätko kočík oblečenie" },
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

/**
 * Select the best-matching option in the Bazoš add-form sub-category dropdown
 * (select[name="category"]). Falls back to the first real option so the
 * required field is always satisfied.
 */
async function selectBestCategoryOption(
  page: import("playwright").Page,
  ctx: ProviderContext,
  wanted: string,
): Promise<void> {
  const sel = 'select[name="category"]';
  if ((await page.locator(sel).count()) === 0) return;
  const options = await page.$$eval(`${sel} option`, (opts) =>
    opts.map((o) => ({
      value: (o as HTMLOptionElement).value,
      text: (o.textContent ?? "").trim(),
    })),
  );
  const real = options.filter((o) => o.value && o.value !== "0");
  if (real.length === 0) return;

  const w = norm(wanted);
  let best = real[0];
  let bestScore = -1;
  for (const o of real) {
    const score = wordOverlap(norm(o.text), w);
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  await page.selectOption(sel, best.value).catch(() => {});
  await ctx.log(`Podkategória (select) → ${best.text}`);
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
