import sharp from "sharp";
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
  // "Topovať" = delete the ad and re-post it (Bazoš has no free bump).
  readonly refreshStrategy = "repost" as const;

  protected baseUrl = BASE_URL;
  // Domain used for section subdomains + ad links. Bazoš CZ overrides this so
  // the whole flow stays on bazos.cz instead of leaking back to bazos.sk.
  protected domain = "bazos.sk";
  // International dialling prefix for this market (foreign portals require it).
  protected phonePrefix = "+421";
  // Some markets require a local-format postcode even for foreign sellers
  // (Bazoš CZ rejects a Slovak ad without a 5-digit Czech PSČ).
  protected fallbackZip = "";

  /**
   * Map a Slovak section key to this market's real subdomain key. Identity for
   * Bazoš SK; Bazoš CZ overrides it (the Czech site uses different keys, e.g.
   * ostatne→ostatni, dom→dum, nabytok→nabytek).
   */
  protected mapSectionKey(key: string): string {
    return key;
  }

  async login(
    credentials: ProviderCredentials,
    ctx: ProviderContext,
  ): Promise<ProviderSession> {
    // Sign in to the Bazoš account when credentials are present. A registered,
    // phone-verified account is NOT asked for an SMS code on every post, so
    // logging in (and persisting the cookies) is what stops the repeated SMS
    // prompts. Falls back to anonymous mapping if no credentials / login fails.
    return this.withContext(null, ctx, async (context) => {
      const page = await context.newPage();
      await ctx.log(`Otváram ${this.name}…`);
      await page.goto(`${this.baseUrl}/`, { waitUntil: "domcontentloaded" });
      await this.acceptCookies(page, ctx);
      await this.debugShot(page, ctx, "home");

      if (credentials.login && credentials.password) {
        await this.tryAccountLogin(
          page,
          ctx,
          credentials.login,
          credentials.password,
        );
      } else {
        await ctx.log(
          "Bez prihlasovacích údajov k Bazoš účtu — Bazoš môže žiadať SMS pri každom pridaní. Pridaj email a heslo k portálu pre menej overovaní.",
        );
      }
      await this.logStructure(page, ctx);

      // Open the add-listing flow and record what it looks like.
      try {
        await page
          .getByText(/p[řr]ida[tť]\s+inzer/i)
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

  /**
   * Best-effort sign-in to a Bazoš account so future posts skip SMS. Bazoš
   * exposes the login at /prihlasit.php with fields name="login" / name="heslo".
   * Logs + screenshots each step so the flow can be verified against the live
   * site; never throws (mapping/publish continues even if login fails).
   */
  private async tryAccountLogin(
    page: import("playwright").Page,
    ctx: ProviderContext,
    login: string,
    password: string,
  ): Promise<void> {
    try {
      await ctx.log("Prihlasujem sa do Bazoš účtu");
      await page
        .goto(`${this.baseUrl}/prihlasit.php`, { waitUntil: "domcontentloaded" })
        .catch(() => {});
      await this.acceptCookies(page, ctx);

      const emailField = page
        .locator('input[name="login"], input[name="email"]')
        .first();
      const passField = page
        .locator('input[name="heslo"], input[type="password"]')
        .first();
      if ((await emailField.count()) === 0 || (await passField.count()) === 0) {
        await this.debugShot(page, ctx, "login-form-missing");
        await ctx.log(
          "Prihlasovací formulár sa nenašiel — pokračujem bez prihlásenia.",
        );
        return;
      }

      await emailField.fill(login).catch(() => {});
      await passField.fill(password).catch(() => {});
      await this.debugShot(page, ctx, "login-filled");
      await page
        .locator(
          'form:has(input[name="heslo"]) input[type="submit"], input[type="submit"][value*="Prihl"]',
        )
        .first()
        .click({ timeout: 8000 })
        .catch(() => page.click('input[type="submit"]').catch(() => {}));
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(1200);
      await this.debugShot(page, ctx, "login-after");

      const body = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      if (/odhlás|moje inzeráty|môj účet|odhlasit/i.test(body)) {
        await ctx.log("Prihlásenie do Bazoš účtu úspešné ✅");
      } else {
        await ctx.log(
          "Prihlásenie sa nepotvrdilo (pozri 'login-after') — pokračujem, no Bazoš môže žiadať SMS.",
        );
      }
    } catch (e) {
      await ctx.log("Prihlásenie zlyhalo, pokračujem bez neho: " + String(e));
    }
  }

  async publish(
    listing: ListingPayload,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<PublishResult> {
    return this.withContext(session, ctx, async (context) => {
      const page = await context.newPage();

      // Step 1 — sections are subdomains with stable keys (auto, dom, pc, …).
      // Prefer the section/subcategory the user picked in Klikado's category
      // picker (stored in parameters); fall back to matching the free text.
      const pickedSection = listing.parameters?.["bazosSection"] as
        | string
        | undefined;
      const pickedSub = listing.parameters?.["bazosCategory"] as
        | string
        | undefined;
      const wanted = pickedSub || listing.category;
      const rawKey =
        pickedSection && SECTIONS.some((s) => s.key === pickedSection)
          ? pickedSection
          : matchSectionKey(wanted);
      // Map the (Slovak) section key to this market's actual subdomain — Bazoš
      // CZ uses different keys (ostatne→ostatni, dom→dum, …). A wrong key
      // resolves to the homepage ("Stránka nenalezena").
      const sectionKey = this.mapSectionKey(rawKey);
      const sectionUrl = `https://${sectionKey}.${this.domain}/pridat-inzerat.php`;
      await ctx.log(`Sekcia "${wanted}" → ${sectionKey} (${sectionUrl})`);
      await page.goto(sectionUrl, { waitUntil: "domcontentloaded" });
      await this.acceptCookies(page, ctx);
      await this.debugShot(page, ctx, "section-add");
      await this.logStructure(page, ctx);

      const hasTitle = async () =>
        (await page.locator(SELECTORS.title).count()) > 0;
      const hasVerify = async () =>
        (await page.locator('input[name="teloverit"]').count()) > 0;

      // Step 2 — the Bazoš add page LEADS with a phone-verification gate
      // (teloverit). The real form (with 'nadpis' + the subcategory <select>)
      // only appears AFTER the phone is verified. Verify first. Do NOT click
      // the subcategory nav links — those go to browse pages and lose the form.
      if (!(await hasTitle()) && (await hasVerify())) {
        await this.handleSmsVerification(page, ctx, listing);
      }

      // Step 3 — fallback: if we somehow landed on a browse/section page (no
      // form and no verify gate), enter the add flow via its "Přidat inzerát"
      // link, then handle the verification gate that follows.
      if (!(await hasTitle()) && !(await hasVerify())) {
        try {
          await page
            .getByText(/p[řr]ida[tť]\s+inzer/i)
            .first()
            .click({ timeout: 6000 });
          await page.waitForLoadState("domcontentloaded").catch(() => {});
          await page.waitForTimeout(900);
          await this.debugShot(page, ctx, "after-pridat");
          await this.logStructure(page, ctx);
        } catch {
          /* no such link */
        }
        if (!(await hasTitle()) && (await hasVerify())) {
          await this.handleSmsVerification(page, ctx, listing);
        }
      }

      if (!(await hasTitle())) {
        throw new Error(
          "Stále nie je pole 'nadpis' — pozri screenshoty 'section-add'/'after-pridat'/'sms-*' a POLIA v logoch.",
        );
      }

      // Log the real add-form fields so per-market field names can be verified.
      await ctx.log("Vypĺňam formulár inzerátu");
      await this.logStructure(page, ctx);

      // The add form has TWO selects: the section (rubrikyvybrat: Auto/Děti/…)
      // and the sub-category (category: Hračky…). The section defaults to the
      // first option (Auto), so it must be set explicitly to match our section,
      // otherwise Bazoš reports "nevyplněné údaje". Set it first (it reloads the
      // sub-category list), then pick the sub-category.
      await page
        .selectOption('select[name="rubrikyvybrat"]', sectionKey)
        .catch(() => {});
      await page.waitForTimeout(600);
      await ctx.log("Sekcia (rubrikyvybrat) nastavená", {
        wanted: sectionKey,
        actual: await page
          .locator('select[name="rubrikyvybrat"]')
          .first()
          .inputValue()
          .catch(() => "∅"),
      });

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

      // Location / PSČ. A market with a fallbackZip (Bazoš CZ) requires a LOCAL
      // postcode — a Slovak PSČ like "01001" is rejected there as not filled —
      // so always use the local fallback on those markets. Bazoš SK has no
      // fallback and uses the listing's own 5-digit PSČ.
      const psc = normalizeZip(listing.zip);
      const loc =
        this.fallbackZip ||
        (psc.length === 5 ? psc : listing.zip || listing.location || "");
      if (loc) await page.fill('input[name="lokalita"]', loc).catch(() => {});
      // "Meno" is required by Bazoš — fall back to the email name or a default
      // so the submit never fails on an empty name.
      const jmeno =
        listing.contactName ||
        listing.email?.split("@")[0] ||
        ctx.secrets?.login?.split("@")[0] ||
        "Inzerent";
      await page.fill('input[name="jmeno"]', jmeno).catch(() => {});
      // Always submit the phone in international format (+421/+420) so foreign
      // portals accept it. Field name differs slightly across markets.
      const phone = formatPhone(listing.phone, this.phonePrefix);
      if (phone) {
        await fillFirst(
          page,
          ['input[name="telefoni"]', 'input[name="telefon"]'],
          phone,
        );
      }
      if (listing.email) {
        await fillFirst(
          page,
          ['input[name="maili"]', 'input[name="mail"]', 'input[name="maileditx"]'],
          listing.email,
        );
      }
      // Per-ad password (lets us — and the user — edit/delete the ad later).
      const adPass = ctx.secrets?.password || "Klikado1234";
      await page.fill('input[name="heslobazar"]', adPass).catch(() => {});

      // Photos.
      if (listing.images.length > 0) {
        const files = await downloadImages(listing.images);
        await ctx.log("Nahrávam fotky", {
          count: files.length,
          sizesKB: files.map((f) => Math.round(f.buffer.length / 1024)),
          types: files.map((f) => f.mimeType),
        });
        await page
          .locator('form:has(input[name="nadpis"]) input[type="file"]')
          .first()
          .setInputFiles(files)
          .catch(() => page.setInputFiles('input[type="file"]', files));
        // Bazoš processes the photo via JS on change (and may clear the input),
        // so give the async upload a moment before submitting.
        await page.waitForTimeout(2500);
      }

      // Agree to the terms checkbox if the add form has one (required).
      await page
        .locator('form:has(input[name="nadpis"]) input[name="podminky"]')
        .check()
        .catch(() => {});

      // Read back what's actually in the form so we can see which required
      // field (if any) is still empty when Bazoš rejects the ad.
      const readback: Record<string, string> = {};
      for (const name of [
        "rubrikyvybrat",
        "category",
        "nadpis",
        "popis",
        "cena",
        "cenavyber",
        "lokalita",
        "jmeno",
        "telefoni",
        "maili",
        "heslobazar",
      ]) {
        readback[name] = await page
          .locator(`[name="${name}"]`)
          .first()
          .inputValue()
          .catch(() => "∅");
      }
      const fileCount = await page
        .locator('input[type="file"]')
        .first()
        .evaluate((el) => (el as HTMLInputElement).files?.length ?? 0)
        .catch(() => -1);
      await ctx.log("Hodnoty formulára pred odoslaním", { ...readback, fileCount });

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
      // Labels cover both Slovak (bazos.sk) and Czech (bazos.cz) wording.
      for (const label of [
        "Vložiť inzerát",
        "Vložit inzerát",
        "Pridať inzerát",
        "Přidat inzerát",
        "Pridať",
        "Přidat",
        "Vložiť",
        "Vložit",
        "Potvrdiť",
        "Potvrdit",
        "Odoslať inzerát",
        "Odeslat inzerát",
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

      // Determine success ONLY from a positive signal, never from "the form is
      // gone": a browse/listing page also has no form, and its first
      // /inzerat/<id> link belongs to a STRANGER's ad — capturing that as our
      // remote id is exactly how a random ad got stored before. So accept only:
      //  (a) we were redirected onto the new ad page itself (URL is /inzerat/N),
      //  (b) a "moje inzeráty" / success page, or
      //  (c) an explicit success message on the page.
      const url = page.url();
      const body = await page
        .locator("body")
        .innerText()
        .catch(() => "");

      const urlIdMatch = url.match(/\/inzerat\/(\d+)/);
      const onMyAds = /moje-inzeraty|moje inzer/i.test(url + " " + body);

      // Bazoš's rejection page literally says the ad was NOT inserted. Detect
      // it explicitly — this MUST win over any positive guess, otherwise a
      // sentence like "Inzerát nebyl vložen" gets misread as success.
      const rejected =
        /(nebyl|nebol|nebyla|nebola)\s+(vlož|vložen|přidán|pridan|zverejnen|zveřejněn)/i.test(
          body,
        ) ||
        /nevyplnen|nevyplněn|nevyplnené|příliš velk|prilis velk|too large|inzerát nebyl|inzerat nebol/i.test(
          body,
        );

      // Positive signals. Rejection is checked first, so once we're past it
      // these words mean success (Bazoš shows "byl vložen … aktivujte přes
      // e-mail" / "úspešne pridaný").
      const successText =
        !rejected &&
        /(úspešne|úspěšně|ďakujeme|děkujeme|aktivuj|aktiva[čc]|aktivovan|odeslali|odesláli|byl[ao]?\s+vlož|bol[ao]?\s+vlož|vložen do|vložený do|pridaný|přidán)/i.test(
          body,
        );

      const live = !rejected && (!!urlIdMatch || onMyAds || successText);

      if (!live) {
        const hint = body.replace(/\s+/g, " ").slice(0, 300);
        throw new Error(
          rejected
            ? `Bazoš odmietol inzerát (chýba povinné pole alebo je fotka príliš veľká): ${hint}`
            : `Bazoš nepotvrdil zverejnenie inzerátu. Text stránky: ${hint}`,
        );
      }

      // Resolve the REAL ad URL. Bazoš shows a generic "insert.php" success
      // page (the ad goes to e-mail activation), so there's usually no
      // /inzerat/<id> URL here. Storing insert.php would give a broken link AND
      // make the status check think the ad doesn't exist. Instead, look it up in
      // "Moje inzeráty" by matching the title.
      let remoteId = urlIdMatch ? urlIdMatch[1] : "";
      let remoteUrl = urlIdMatch ? url : "";
      if (!remoteId) {
        const own = await this.resolveOwnAdUrl(page, ctx, listing.title);
        if (own) {
          remoteId = own.id;
          remoteUrl = own.url;
        } else {
          // Couldn't pin the exact ad (e.g. not logged in). Keep a useful link
          // to the user's ads, and leave remoteId empty so the status check
          // never wrongly marks it removed.
          remoteUrl = `${this.baseUrl}/moje-inzeraty.php`;
          remoteId = "";
        }
      }
      await ctx.log("Inzerát zverejnený ✅", { remoteId, remoteUrl });
      return { remoteId, remoteUrl, session: await this.snapshot(context) };
    });
  }

  /**
   * After posting, find the new ad's real URL in "Moje inzeráty" by matching
   * the listing title. Requires the account session; returns null if it can't
   * be pinned (so the caller keeps a safe fallback instead of a broken link).
   */
  private async resolveOwnAdUrl(
    page: import("playwright").Page,
    ctx: ProviderContext,
    title: string,
  ): Promise<{ id: string; url: string } | null> {
    try {
      await page
        .goto(`${this.baseUrl}/moje-inzeraty.php`, {
          waitUntil: "domcontentloaded",
        })
        .catch(() => {});
      await this.acceptCookies(page, ctx);
      await this.debugShot(page, ctx, "moje-inzeraty");

      const links = await page.$$eval('a[href*="/inzerat/"]', (as) =>
        as.map((a) => ({
          text: (a.textContent ?? "").trim(),
          href: (a as HTMLAnchorElement).href,
        })),
      );
      if (!links.length) return null;

      const w = norm(title);
      let best: { text: string; href: string } | null = null;
      let bestScore = 0;
      for (const l of links) {
        if (!/\/inzerat\/\d+/.test(l.href)) continue;
        const score = wordOverlap(norm(l.text), w);
        if (score > bestScore) {
          bestScore = score;
          best = l;
        }
      }
      if (best && bestScore > 0) {
        const m = best.href.match(/\/inzerat\/(\d+)/);
        if (m) {
          await ctx.log(`Nájdený vlastný inzerát → ${best.href}`);
          return { id: m[1], url: best.href };
        }
      }
      return null;
    } catch {
      return null;
    }
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
    // Prefer the account's dedicated verification phone (your phone that gets
    // the SMS), falling back to the listing's contact phone.
    const rawPhone = ctx.secrets?.verifyPhone || listing.phone || "";
    const phone = formatPhone(rawPhone, this.phonePrefix);
    if (!phone) {
      throw new Error(
        "Bazoš vyžaduje overenie telefónu, ale nie je zadané žiadne číslo " +
          "(zadaj 'Telefón na SMS overenie' pri Bazoš účte alebo telefón v inzeráte).",
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

    // Decide what the page is showing after submitting the phone.
    const codeField = page.locator('input[name="klic"]');
    if ((await codeField.count()) === 0) {
      // No code field: either already verified (form shown) or an error.
      const body = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      if (
        /prekročili|překročili|skúste to neskôr|zkuste to později|maximum kódov|maximum kódů/i.test(
          body,
        )
      ) {
        throw new Error(
          "Bazoš dočasne zablokoval SMS kódy pre toto číslo (priveľa pokusov). " +
            "Skús to znova o niekoľko hodín alebo zajtra — nie je to chyba Klikada.",
        );
      }
      if ((await page.locator('input[name="nadpis"]').count()) === 0) {
        const hint = body.replace(/\s+/g, " ").slice(0, 200);
        throw new Error(
          `Overenie telefónu neprešlo a formulár sa neukázal. Text stránky: ${hint}`,
        );
      }
      await ctx.log("Telefón už overený — pokračujem na formulár");
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

  /**
   * Edit an existing ad IN PLACE (no delete + re-post). Bazoš lets you edit a
   * live ad via its "Editovať inzerát" link + the per-ad password, which does
   * NOT trigger a new SMS verification. Keeps the same remote id/URL and the
   * accumulated views. Falls back to a fresh publish only if the ad is gone.
   */
  async update(
    remoteId: string,
    listing: ListingPayload,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<PublishResult> {
    return this.withContext(session, ctx, async (context) => {
      const page = await context.newPage();
      const url = remoteId.startsWith("http")
        ? remoteId
        : `${this.baseUrl}/inzerat/${remoteId}`;
      await ctx.log("Upravujem inzerát na portáli (priama úprava)", { remoteId });
      await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
      await this.acceptCookies(page, ctx);
      await this.debugShot(page, ctx, "edit-open");

      const editLink = page.getByText(/Editova[tť] inzer/i).first();
      if ((await editLink.count()) === 0) {
        await ctx.log(
          "Odkaz na úpravu sa nenašiel — inzerát asi neexistuje, nahrávam nový",
        );
        return this.publish(listing, session, ctx);
      }
      await editLink.click().catch(() => {});
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(800);
      await this.debugShot(page, ctx, "edit-pass");

      // Enter the per-ad password if Bazoš asks for it before showing the form.
      const pass = ctx.secrets?.password || "Klikado1234";
      const passField = page
        .locator('input[name="heslobazar"], input[name="heslo"]')
        .first();
      if (
        (await passField.count()) &&
        (await page.locator('input[name="nadpis"]').count()) === 0
      ) {
        await passField.fill(pass).catch(() => {});
        await page
          .locator(
            'form:has(input[name="heslobazar"]) input[type="submit"], form:has(input[name="heslo"]) input[type="submit"]',
          )
          .first()
          .click({ timeout: 8000 })
          .catch(() => page.click('input[type="submit"]').catch(() => {}));
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.waitForTimeout(800);
      }
      await this.debugShot(page, ctx, "edit-form");
      await this.logStructure(page, ctx);

      if ((await page.locator('input[name="nadpis"]').count()) === 0) {
        throw new Error(
          "Nepodarilo sa otvoriť editačný formulár (pozri 'edit-pass'/'edit-form') " +
            "— pravdepodobne nesprávne heslo inzerátu.",
        );
      }

      // Update the editable fields in place.
      await page.fill('input[name="nadpis"]', listing.title).catch(() => {});
      await page
        .fill('textarea[name="popis"]', listing.description)
        .catch(() => {});
      if (listing.price != null) {
        await page.fill('input[name="cena"]', String(listing.price)).catch(() => {});
      }
      const phone = formatPhone(listing.phone, this.phonePrefix);
      if (phone) {
        await page.fill('input[name="telefoni"]', phone).catch(() => {});
      }
      if (listing.email) {
        await page.fill('input[name="maili"]', listing.email).catch(() => {});
      }

      await this.debugShot(page, ctx, "edit-filled");
      await page
        .locator('form:has(input[name="nadpis"]) input[type="submit"]')
        .first()
        .click({ timeout: 10000 })
        .catch(() => page.click('input[type="submit"]').catch(() => {}));
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(1200);
      await this.debugShot(page, ctx, "edit-done");

      await ctx.log("Inzerát upravený ✅ (bez nového overenia)", { remoteId });
      return {
        remoteId,
        remoteUrl: url,
        session: await this.snapshot(context),
      };
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
      const url = remoteId.startsWith("http")
        ? remoteId
        : `${this.baseUrl}/inzerat/${remoteId}`;
      await ctx.log("Mažem inzerát z Bazoša", { remoteId });
      await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
      await this.acceptCookies(page, ctx);
      await this.debugShot(page, ctx, "delete-ad");
      await this.logStructure(page, ctx);

      const pass = ctx.secrets?.password || "";

      // The ad page offers an "Editovať / Zmazať inzerát" link (SK + CZ).
      const delLink = page.getByText(/(zmaza|smaza)[tť]\s*inzer/i).first();
      const editLink = page.getByText(/editova[tť]\s*inzer/i).first();
      if (await delLink.count()) {
        await delLink.click().catch(() => {});
      } else if (await editLink.count()) {
        await editLink.click().catch(() => {});
      } else {
        throw new Error(
          "Nenašiel som odkaz na úpravu/zmazanie inzerátu — pozri screenshot 'delete-ad'.",
        );
      }
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(1000);
      await this.debugShot(page, ctx, "delete-step2");
      await this.logStructure(page, ctx);

      // Enter the ad password if requested.
      const passField = page
        .locator(
          'input[name="heslobazar"], input[name="heslo"], input[type="password"]',
        )
        .first();
      if ((await passField.count()) && pass) {
        await passField.fill(pass).catch(() => {});
      }

      // Confirm the deletion.
      await page
        .getByRole("button", {
          name: /Zmazať|Smazat|Vymazať|Odstrániť|Odstranit|Potvrdiť|Potvrdit/i,
        })
        .first()
        .click({ timeout: 6000 })
        .catch(() => page.click('input[type="submit"]').catch(() => {}));
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(1000);
      await this.debugShot(page, ctx, "delete-done");
      await this.logStructure(page, ctx);
      await ctx.log("Inzerát zmazaný (alebo pokus dokončený)");
    });
  }

  async checkStatus(
    remoteId: string,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<StatusResult> {
    return this.withContext(session, ctx, async (context) => {
      const page = await context.newPage();

      // Step 1 — if we have a real ad URL, check it directly.
      const isAdRef = /\/inzerat\/\d+/.test(remoteId) || /^\d+$/.test(remoteId);
      if (isAdRef) {
        const url = remoteId.startsWith("http")
          ? remoteId
          : `${this.baseUrl}/inzerat/${remoteId}`;
        const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
        const httpStatus = resp?.status() ?? 0;
        const body = await page
          .locator("body")
          .innerText()
          .catch(() => "");
        const removed =
          httpStatus >= 400 ||
          /inzer\w*\s+(bol|bola|byl|byla)?\s*(vymazan|zmazan|smazán|odstr[aá]n|deaktivov|expirov)/i.test(
            body,
          ) ||
          /(inzer\w*\s+(už\s+)?ne(existuje|existuj)|neb(ol|yl)\s+n[aá]jden|str[aá]nka\s+nebola?\s+n[aá]jden|404\s+not\s+found)/i.test(
            body,
          );
        if (!removed) {
          const views = parseViews(body);
          await ctx.log("Kontrola stavu inzerátu (priamy odkaz)", {
            remoteId,
            live: true,
            views,
          });
          return { live: true, verified: true, remoteUrl: url, views };
        }
        // Direct URL says gone — but the ad may have been re-posted to a new
        // id, so fall through and confirm against "Moje inzeráty" by title.
      }

      // Step 2 — verify against the account's "Moje inzeráty" by title. This is
      // the source of truth and survives re-posts (new id each time).
      if (ctx.listingTitle) {
        const own = await this.resolveOwnAdUrl(page, ctx, ctx.listingTitle);
        if (own) {
          // Open the ad page itself to read its current view count.
          let views: number | undefined;
          try {
            await page.goto(own.url, { waitUntil: "domcontentloaded" });
            const adBody = await page
              .locator("body")
              .innerText()
              .catch(() => "");
            views = parseViews(adBody);
          } catch {
            /* views are best-effort */
          }
          await ctx.log("Inzerát potvrdený cez Moje inzeráty", {
            remoteId: own.id,
            views,
          });
          return {
            live: true,
            verified: true,
            remoteId: own.id,
            remoteUrl: own.url,
            views,
          };
        }
        // Decide if we're really logged in. "Moje inzeráty" is in the top nav on
        // EVERY page, so it can't be the signal — require a logout link AND the
        // absence of a login form. Only then does "ad not in the list" mean it
        // was removed; otherwise we genuinely can't tell.
        const listBody = await page
          .locator("body")
          .innerText()
          .catch(() => "");
        const hasLoginForm =
          (await page
            .locator('input[type="password"], input[name="heslo"]')
            .count()
            .catch(() => 0)) > 0 ||
          /přihlášení|prihlásenie|přihlásit\s+se|prihlásiť\s+sa/i.test(listBody);
        const definitelyLoggedIn =
          !hasLoginForm && /odhl[aá]si|logout/i.test(listBody);
        if (definitelyLoggedIn) {
          await ctx.log(
            "Inzerát sa v Moje inzeráty nenašiel (prihlásený účet) — považujem za odstránený",
          );
          return { live: false, verified: true };
        }
        await ctx.log(
          "Nedá sa overiť (nie som prihlásený do Bazoš účtu) — stav nechávam bez zmeny.",
        );
      }

      // Couldn't determine (not logged in / no title) — do NOT change status.
      await ctx.log(
        "Stav inzerátu sa nepodarilo overiť — nechávam ho bez zmeny.",
      );
      return { live: false, verified: false };
    });
  }
}

// --- helpers ---------------------------------------------------------------

/** Fill the first of several candidate selectors that exists on the page. */
async function fillFirst(
  page: import("playwright").Page,
  selectors: string[],
  value: string,
): Promise<void> {
  for (const sel of selectors) {
    if ((await page.locator(sel).count()) > 0) {
      await page.fill(sel, value).catch(() => {});
      return;
    }
  }
}

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
  domain: string,
): Promise<string | null> {
  const host = `${sectionKey}.${domain}`;
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
    const raw = Buffer.from(await res.arrayBuffer());
    // Bazoš rejects WebP and oversized images ("príliš veľký obrázok"), so
    // always re-encode to a compact JPEG (max 1200px, quality 80).
    let buffer: Buffer = raw;
    try {
      buffer = await sharp(raw)
        .rotate()
        .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      buffer = raw;
    }
    out.push({ name: `photo-${i}.jpg`, mimeType: "image/jpeg", buffer });
  }
  return out;
}

function extractIdFromUrl(url: string): string | null {
  const m = url.match(/(\d{6,})/);
  return m ? m[1] : null;
}

/** Normalise a phone number to international format (+421 / +420 …). */
function formatPhone(raw: string | null | undefined, prefix: string): string {
  if (!raw) return "";
  const p = raw.replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);
  if (p.startsWith("0")) return prefix + p.slice(1); // local 0900… → +421900…
  return prefix + p;
}

/** Keep only digits from a postcode (e.g. "010 01" → "01001"). */
function normalizeZip(zip: string | null | undefined): string {
  return (zip ?? "").replace(/\D/g, "");
}

/**
 * Parse a Bazoš ad's view count from the page text. Bazoš shows it as e.g.
 * "Počet zobrazení: 1 234" / "Videné: 1234". Returns undefined when not found.
 */
function parseViews(body: string): number | undefined {
  const m = body.match(
    /(?:po[čc]et\s+zobrazen[ií]|viden[ée]|zhliadnut[ií])[:\s]*([\d\s.]+)/i,
  );
  if (!m) return undefined;
  const n = parseInt(m[1].replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}
