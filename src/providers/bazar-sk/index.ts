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
// Bazar.sk (browser automation) — United Classifieds platform
//
// Bazar.sk lets you post WITHOUT an account: you fill a 3-step wizard
// (1. Kategória → 2. Inzerát → 3. Ukončenie), set a per-ad password, and the
// phone is verified by an SMS code. This mirrors Bazoš closely, so the flow
// reuses the same ideas: pick a category, fill the form, upload photos, submit,
// handle the SMS, then resolve the live ad.
//
// We can't inspect the live DOM from the build sandbox, so the form is filled
// by LABEL (the visible "Nadpis:/Text:/Cena:/…" captions) rather than fragile
// name="" guesses, and every step logs its structure + a screenshot so the flow
// can be verified and tuned from the deploy logs.
// ===========================================================================

const BASE_URL = "https://www.bazar.sk";

export class BazarSkProvider extends BrowserProvider {
  readonly key = "bazar-sk";
  readonly name = "Bazar.sk";
  readonly country = "SK";
  readonly supportsRefresh = false;

  protected baseUrl = BASE_URL;

  // ---- login -------------------------------------------------------------
  // Bazar.sk posts as a guest (per-ad password + SMS), so there is no real
  // sign-in. We just open the site, clear cookies, and capture the structure
  // of the add flow for reference.
  async login(
    credentials: ProviderCredentials,
    ctx: ProviderContext,
  ): Promise<ProviderSession> {
    void credentials;
    return this.withContext(null, ctx, async (context) => {
      const page = await context.newPage();
      await ctx.log(`Otváram ${this.name}…`);
      await page.goto(`${this.baseUrl}/`, { waitUntil: "domcontentloaded" });
      await this.dismissCookies(page, ctx);
      await this.debugShot(page, ctx, "home");
      const session = await this.snapshot(context);
      return {
        ...session,
        validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      };
    });
  }

  // ---- publish -----------------------------------------------------------
  async publish(
    listing: ListingPayload,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<PublishResult> {
    return this.withContext(session, ctx, async (context) => {
      const page = await context.newPage();
      // Go straight to the guest add wizard (/pridanie-neprihlaseny/) and clear
      // the Sourcepoint consent overlay so the wizard is clickable.
      await this.openAddFlow(page, ctx);
      await this.dismissCookies(page, ctx);
      await this.debugShot(page, ctx, "add-step1");
      await this.logStructure(page, ctx);

      // --- Step 1: Kategória --------------------------------------------
      // Reach the actual ad form (the "Nadpis" field) by clicking the best
      // matching category / sub-category. Bazar.sk expands sub-categories after
      // the main one, so loop a few times until the form appears.
      const wantedCat = bazarCategory(listing.category);
      await ctx.log(`Hľadám kategóriu na Bazar.sk: "${wantedCat}"`);
      for (let step = 0; step < 4; step++) {
        if (await this.hasField(page, "Nadpis")) break;
        const clicked = await this.clickCategory(page, ctx, wantedCat);
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.waitForTimeout(900);
        await this.debugShot(page, ctx, `add-cat-${step}`);
        if (!clicked) break;
      }

      if (!(await this.hasField(page, "Nadpis"))) {
        await this.logStructure(page, ctx);
        throw new Error(
          "Bazar.sk: nepodarilo sa dostať na formulár inzerátu (pole 'Nadpis' chýba) — pozri screenshoty 'add-cat-*' a POLIA v logoch.",
        );
      }

      // --- Step 2: Inzerát ----------------------------------------------
      await ctx.log("Vypĺňam formulár inzerátu na Bazar.sk");
      await this.logStructure(page, ctx);

      // Type = Predaj is the default selected radio; nothing to do.
      await this.fillLabeled(page, "Nadpis", listing.title);
      // Bazar.sk requires at least 20 characters of body text.
      const body = ensureMinLength(listing.description, listing.title, 20);
      await this.fillLabeled(page, "Text", body, "textarea");

      if (listing.price != null) {
        await this.fillLabeled(page, "Cena", String(listing.price));
      }

      // "Stav" (condition) is a required dropdown — pick a sensible option
      // ("Použité"), else the first real option so the field is satisfied.
      await this.selectLabeled(page, "Stav", /použit|pouzit|nové|nove|zachoval/i);

      // Location: bazar.sk accepts a PSČ or a town. Use the listing's PSČ/town.
      const loc =
        normalizeZip(listing.zip).length === 5
          ? normalizeZip(listing.zip)
          : listing.location || listing.zip || "";
      if (loc) await this.fillLabeled(page, "Lokalita", loc);

      // Any remaining required <select> in the category Špecifikácia block —
      // pick its first real option so a category with extra fields still submits.
      await this.fillRequiredSelects(page, ctx);

      // Photos.
      if (listing.images.length > 0) {
        const files = await downloadImages(listing.images);
        await ctx.log("Nahrávam fotky na Bazar.sk", {
          count: files.length,
          sizesKB: files.map((f) => Math.round(f.buffer.length / 1024)),
        });
        await page
          .locator('input[type="file"]')
          .first()
          .setInputFiles(files)
          .catch(() => {});
        await page.waitForTimeout(3000);
      }

      // Contact block.
      const jmeno =
        listing.contactName ||
        listing.email?.split("@")[0] ||
        "Inzerent";
      await this.fillLabeled(page, "Meno", jmeno);
      if (listing.email) await this.fillLabeled(page, "E-mail", listing.email);
      const phone = localPhone(ctx.secrets?.verifyPhone || listing.phone);
      if (phone) await this.fillLabeled(page, "Telefón", phone);
      // Per-ad password (min 7 chars) — lets us edit/delete later.
      const adPass = sevenPlus(ctx.secrets?.password);
      await this.fillLabeled(page, "Heslo", adPass);

      // Agree to the listing terms (required checkbox before "podmienkami inzercie").
      await this.checkTerms(page, ctx);

      await this.debugShot(page, ctx, "form-filled");

      // Submit — "DOKONČIŤ PRIDÁVANIE INZERÁTU".
      await this.clickButton(page, /dokon[čc]i|prida[ťt]|odosla[ťt]|pokra[čc]ova/i);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(1800);
      await this.debugShot(page, ctx, "after-submit");
      await this.logStructure(page, ctx);

      // --- SMS verification (phone gets an overovací kód) ----------------
      await this.maybeSmsVerification(page, ctx);

      // --- Step 3: Ukončenie / result -----------------------------------
      await this.debugShot(page, ctx, "after-confirm");
      await this.logStructure(page, ctx);

      const url = page.url();
      const text = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      const rejected =
        /(nebol|nebola|nepodaril)\w*\s+(prida|vlož|zverejn|ulož)/i.test(text) ||
        /chyba|povinn[ée]\s+pole|nevyplnen/i.test(text);

      const adLink = await page
        .locator('a[href*="/inzerat/"]')
        .first()
        .getAttribute("href")
        .catch(() => null);
      const urlIsAd = /\/inzerat\//.test(url);
      const success =
        !rejected &&
        (urlIsAd ||
          !!adLink ||
          /úspe[šs]|ďakujeme|dakujeme|zverejnen|prida[nl]|aktivuj|dokon[čc]en/i.test(
            text,
          ));

      if (!success) {
        const hint = text.replace(/\s+/g, " ").slice(0, 300);
        throw new Error(
          rejected
            ? `Bazar.sk odmietol inzerát (chýba povinné pole alebo fotka): ${hint}`
            : `Bazar.sk nepotvrdil zverejnenie inzerátu. Text stránky: ${hint}`,
        );
      }

      let remoteUrl = urlIsAd ? url : adLink ? absolute(adLink) : "";
      let remoteId = remoteUrl ? extractAdId(remoteUrl) : "";
      if (!remoteUrl) {
        // Couldn't pin the exact ad URL — keep a useful fallback and leave the
        // id empty so a later status check never wrongly flips it to removed.
        remoteUrl = `${this.baseUrl}/moje-inzeraty/`;
        remoteId = "";
      }

      await ctx.log("Inzerát zverejnený na Bazar.sk ✅", { remoteId, remoteUrl });
      return { remoteId, remoteUrl, session: await this.snapshot(context) };
    });
  }

  // ---- delete ------------------------------------------------------------
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
      await ctx.log("Mažem inzerát z Bazar.sk", { remoteId });
      await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
      await this.dismissCookies(page, ctx);
      await this.debugShot(page, ctx, "delete-open");

      const delLink = page
        .getByText(/(zmaza|odstr[aá]ni|vymaza)[tť]/i)
        .first();
      if (await delLink.count()) {
        await delLink.click().catch(() => {});
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.waitForTimeout(900);
        // Enter the per-ad password if requested.
        const pass = ctx.secrets?.password || "";
        const passField = page.locator('input[type="password"]').first();
        if ((await passField.count()) && pass) {
          await passField.fill(pass).catch(() => {});
        }
        await this.clickButton(page, /zmaza|odstr[aá]ni|vymaza|potvrd/i);
        await page.waitForTimeout(900);
      }
      await this.debugShot(page, ctx, "delete-done");
      await ctx.log("Pokus o zmazanie dokončený");
    });
  }

  // ---- checkStatus -------------------------------------------------------
  async checkStatus(
    remoteId: string,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<StatusResult> {
    return this.withContext(session, ctx, async (context) => {
      const page = await context.newPage();
      const isAdRef =
        /\/inzerat\//.test(remoteId) || /^\d+$/.test(remoteId);
      if (isAdRef) {
        const url = remoteId.startsWith("http")
          ? remoteId
          : `${this.baseUrl}/inzerat/${remoteId}`;
        const resp = await page
          .goto(url, { waitUntil: "domcontentloaded" })
          .catch(() => null);
        const httpStatus = resp?.status() ?? 0;
        const text = await page
          .locator("body")
          .innerText()
          .catch(() => "");
        const removed =
          httpStatus >= 400 ||
          /(inzer\w*\s+(bol|bola)?\s*(vymazan|zmazan|odstr[aá]n|deaktivov|expirov))|nen[aá]jden|neexistuje|404/i.test(
            text,
          );
        if (!removed) {
          const views = parseViews(text);
          await ctx.log("Kontrola stavu (Bazar.sk, priamy odkaz)", {
            remoteId,
            live: true,
            views,
          });
          return { live: true, verified: true, remoteUrl: url, views };
        }
        return { live: false, verified: true };
      }
      // No reliable id — don't change the stored status.
      await ctx.log("Bazar.sk: stav sa nepodarilo overiť — nechávam bez zmeny.");
      return { live: false, verified: false };
    });
  }

  // ---- helpers (instance) ------------------------------------------------

  /**
   * Dismiss the bazar.sk cookie-consent dialog. It's a CMP modal, so click the
   * real button by role ("Prijať všetko") or the "Pokračovať s nevyhnutnými
   * cookies" link — getByText alone sometimes misses it.
   */
  private async dismissCookies(
    page: import("playwright").Page,
    ctx: ProviderContext,
  ): Promise<void> {
    const targets: RegExp[] = [
      /prija[ťt]\s+v[šs]etko/i,
      /s[úu]hlas[ií]m?/i,
      /accept all/i,
      /rozumiem/i,
    ];
    // bazar.sk uses Sourcepoint, rendered in an iframe (id^="sp_message_iframe",
    // src on privacy.bazar.sk). Try clicking "Prijať všetko" inside it.
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.waitForTimeout(attempt === 0 ? 900 : 700);
      const hasOverlay =
        (await page
          .locator('[id^="sp_message_container"]')
          .count()
          .catch(() => 0)) > 0;
      if (!hasOverlay) return;
      const fl = page.frameLocator(
        'iframe[id^="sp_message_iframe"], iframe[title*="Consent" i], iframe[src*="privacy.bazar.sk"]',
      );
      for (const name of targets) {
        try {
          const btn = fl.getByRole("button", { name }).first();
          if (await btn.count()) {
            await btn.click({ timeout: 2500 });
            await page.waitForTimeout(700);
            if (
              (await page
                .locator('[id^="sp_message_container"]')
                .count()
                .catch(() => 0)) === 0
            ) {
              await ctx.log(`Cookies prijaté (${name})`);
              return;
            }
          }
        } catch {
          /* try next */
        }
      }
    }
    // Guaranteed fallback: remove the consent overlay so it stops intercepting
    // pointer events (the form below stays fully usable).
    await page
      .evaluate(() => {
        document
          .querySelectorAll(
            '[id^="sp_message_container"], [id^="sp_message_open"], [class*="sp_veil"], div[role="dialog"][aria-modal="true"]',
          )
          .forEach((e) => e.remove());
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";
      })
      .catch(() => {});
    await ctx.log("Cookie prekrytie odstránené (fallback).");
  }

  /**
   * Open the guest add wizard. The "Pridať inzerát" link for a non-logged-in
   * user points at /pridanie-neprihlaseny/, so navigate there directly (a click
   * is blocked by the consent overlay anyway).
   */
  private async openAddFlow(
    page: import("playwright").Page,
    ctx: ProviderContext,
  ): Promise<void> {
    await page
      .goto(`${this.baseUrl}/pridanie-neprihlaseny/`, {
        waitUntil: "domcontentloaded",
      })
      .catch(() => {});
    await page.waitForTimeout(800);
    void ctx;
  }

  /** True if an input/textarea associated with a label caption exists. */
  private async hasField(
    page: import("playwright").Page,
    label: string,
  ): Promise<boolean> {
    return (
      (await page
        .locator(labelXpath(label, "input"))
        .count()
        .catch(() => 0)) > 0 ||
      (await page
        .locator(labelXpath(label, "textarea"))
        .count()
        .catch(() => 0)) > 0
    );
  }

  /** Fill the input/textarea that follows a label caption (e.g. "Nadpis"). */
  private async fillLabeled(
    page: import("playwright").Page,
    label: string,
    value: string,
    tag: "input" | "textarea" = "input",
  ): Promise<void> {
    const loc = page.locator(labelXpath(label, tag)).first();
    if ((await loc.count().catch(() => 0)) === 0) return;
    await loc.fill(value).catch(() => {});
  }

  /** Select an option (preferring a regex match) in the dropdown after a label. */
  private async selectLabeled(
    page: import("playwright").Page,
    label: string,
    prefer: RegExp,
  ): Promise<void> {
    const sel = page.locator(labelXpath(label, "select")).first();
    if ((await sel.count().catch(() => 0)) === 0) return;
    const options = await sel
      .locator("option")
      .evaluateAll((opts) =>
        opts.map((o) => ({
          value: (o as HTMLOptionElement).value,
          text: (o.textContent ?? "").trim(),
        })),
      )
      .catch(() => [] as { value: string; text: string }[]);
    const real = options.filter(
      (o) => o.value && !/^(0|)$/.test(o.value) && !/vyberte/i.test(o.text),
    );
    if (real.length === 0) return;
    const pick = real.find((o) => prefer.test(o.text)) ?? real[0];
    await sel.selectOption(pick.value).catch(() => {});
  }

  /** Satisfy any still-unset required dropdowns (category specifics). */
  private async fillRequiredSelects(
    page: import("playwright").Page,
    ctx: ProviderContext,
  ): Promise<void> {
    const selects = page.locator("form select");
    const n = await selects.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const s = selects.nth(i);
      const cur = await s.inputValue().catch(() => "");
      if (cur && !/^0$/.test(cur)) continue; // already set
      // Read the currently shown option text so we can skip the optional
      // "cena – zvoľte inú možnosť" dropdown (filling it would override price).
      const curText = await s
        .locator("option:checked")
        .first()
        .innerText()
        .catch(() => "");
      if (/in[úu]\s*mo[žz]nos/i.test(curText)) continue;
      const opts = await s
        .locator("option")
        .evaluateAll((o) =>
          o.map((e) => ({
            value: (e as HTMLOptionElement).value,
            text: (e.textContent ?? "").trim(),
          })),
        )
        .catch(() => [] as { value: string; text: string }[]);
      if (opts.some((o) => /in[úu]\s*mo[žz]nos/i.test(o.text))) continue;
      const real = opts.find(
        (o) => o.value && !/^0$/.test(o.value) && !/vyberte/i.test(o.text),
      );
      if (real) await s.selectOption(real.value).catch(() => {});
    }
    void ctx;
  }

  /**
   * Click the best-matching category on the add wizard. The page also carries
   * the site-wide browse megamenu (links to category SUBDOMAINS like
   * auto.bazar.sk) — those are NOT the wizard, so only consider links that stay
   * on the add flow (www.bazar.sk …pridanie/pridat…), preferring an exact name.
   */
  private async clickCategory(
    page: import("playwright").Page,
    ctx: ProviderContext,
    wanted: string,
  ): Promise<boolean> {
    const w = norm(wanted);
    const links = await page
      .locator("a")
      .evaluateAll((as) =>
        as
          .map((a) => ({
            text: (a.textContent ?? "").trim(),
            href: (a as HTMLAnchorElement).href,
          }))
          .filter((l) => l.text.length > 1 && l.text.length < 40),
      )
      .catch(() => [] as { text: string; href: string }[]);

    const isWizard = (href: string) => {
      try {
        const u = new URL(href);
        return (
          u.hostname === "www.bazar.sk" &&
          /pridani|pridat/i.test(u.pathname + u.search)
        );
      } catch {
        return false;
      }
    };
    const score = (text: string) => {
      const t = norm(text);
      if (t === w) return 1000; // exact match wins
      // overlap, lightly penalising longer ("Ostatné oblečenie" vs "Ostatné")
      return wordOverlap(t, w) * 10 - Math.abs(t.length - w.length) * 0.1;
    };

    // 1) Prefer real wizard links.
    const wiz = links.filter((l) => isWizard(l.href));
    if (wiz.length) {
      let best = wiz[0];
      let bs = -Infinity;
      for (const l of wiz) {
        const s = score(l.text);
        if (s > bs) {
          bs = s;
          best = l;
        }
      }
      await ctx.log(`Kategória (wizard) → ${best.text}`);
      await page
        .locator(`a[href="${best.href}"]`)
        .first()
        .click({ timeout: 6000 })
        .catch(() => {});
      return true;
    }

    // 2) Fallback: click a tile whose visible text is EXACTLY the category.
    const exact = page
      .getByText(new RegExp(`^\\s*${escapeRe(wanted)}\\s*$`, "i"))
      .first();
    if (await exact.count().catch(() => 0)) {
      await ctx.log(`Kategória (text) → ${wanted}`);
      await exact.click({ timeout: 6000 }).catch(() => {});
      return true;
    }
    return false;
  }

  /** Tick the "Súhlasím s podmienkami inzercie" checkbox. */
  private async checkTerms(
    page: import("playwright").Page,
    ctx: ProviderContext,
  ): Promise<void> {
    const cb = page
      .locator(
        'xpath=//*[contains(normalize-space(.),"podmienkami inzercie")]/preceding::input[@type="checkbox"][1]',
      )
      .first();
    if (await cb.count().catch(() => 0)) {
      await cb.check().catch(() => {});
      return;
    }
    // Fallback: the last checkbox on the form is usually the terms box.
    const all = page.locator('form input[type="checkbox"]');
    const n = await all.count().catch(() => 0);
    if (n > 0) await all.nth(n - 1).check().catch(() => {});
    void ctx;
  }

  /** Click a button/submit whose label matches a regex. */
  private async clickButton(
    page: import("playwright").Page,
    label: RegExp,
  ): Promise<void> {
    const byRole = page.getByRole("button", { name: label }).first();
    if (await byRole.count().catch(() => 0)) {
      await byRole.click({ timeout: 8000 }).catch(() => {});
      return;
    }
    // <input type="submit"> whose value matches.
    const inputs = page.locator('input[type="submit"], button[type="submit"]');
    const n = await inputs.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = inputs.nth(i);
      const v =
        (await el.getAttribute("value").catch(() => "")) ||
        (await el.innerText().catch(() => ""));
      if (label.test(v || "")) {
        await el.click({ timeout: 8000 }).catch(() => {});
        return;
      }
    }
    // Last resort: first submit on the page.
    await inputs
      .first()
      .click({ timeout: 8000 })
      .catch(() => {});
  }

  /**
   * If bazar.sk shows an SMS overovací-kód step after submit, pause for the
   * user's code (worker sets WAITING_SMS), enter it and confirm.
   */
  private async maybeSmsVerification(
    page: import("playwright").Page,
    ctx: ProviderContext,
  ): Promise<void> {
    const text = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const wantsCode =
      /overovac[ií]|overen|SMS|zadajte\s+k[óo]d|k[óo]d\s+z\s+SMS/i.test(text) &&
      !/inzer[aá]t\s+(bol|je)\s+(prida|zverejnen)/i.test(text);
    if (!wantsCode) return;

    await this.debugShot(page, ctx, "sms-code-page");
    if (!ctx.requestUserInput) {
      throw new Error("Bazar.sk vyžaduje SMS kód, ale chýba interaktívne zadanie.");
    }
    const code = await ctx.requestUserInput(
      "Zadaj overovací SMS kód z Bazar.sk, ktorý ti prišiel na telefón.",
    );
    if (!code) {
      throw new Error("SMS kód nebol zadaný včas — skús publikovať znova.");
    }
    // Fill the most likely code field (a short, empty, visible text/number box).
    const field = page
      .locator(
        'input[type="text"]:visible, input[type="tel"]:visible, input[type="number"]:visible',
      )
      .first();
    await field.fill(code).catch(() => {});
    await this.clickButton(page, /overi[ťt]|potvrd|pokra[čc]ova|dokon[čc]i/i);
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(1500);
    await this.debugShot(page, ctx, "after-sms");
    try {
      await ctx.saveSession?.({ state: await page.context().storageState() });
    } catch {
      /* non-fatal */
    }
    await ctx.log("SMS kód odoslaný ✅");
  }
}

// --- module helpers --------------------------------------------------------

/** XPath locator: the first <tag> following the caption cell that starts with `label`. */
function labelXpath(label: string, tag: string): string {
  const l = JSON.stringify(label); // safe double-quoted string for XPath
  return `xpath=(//*[starts-with(normalize-space(.), ${l})])[last()]/following::${tag}[1]`;
}

/** Escape a string for safe use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  let n = 0;
  for (const w of b.split(/[^a-z0-9]+/).filter((w) => w.length > 2))
    if (wa.has(w)) n++;
  return n;
}

// Bazar.sk top-level categories. A free-text listing category is matched to the
// closest one; anything unclear lands in "Ostatné" (which has no required
// per-category specification fields, so it always submits cleanly).
const BAZAR_CATEGORIES = [
  "Autá",
  "Detské potreby",
  "Elektro",
  "Hudba",
  "Knihy",
  "Mobily",
  "Motorky",
  "Nábytok a bývanie",
  "Oblečenie a obuv",
  "Počítače",
  "Práca",
  "Reality",
  "Služby",
  "Stavba a záhrada",
  "Stroje a náradie",
  "Športové potreby",
  "Zdravie a krása",
  "Zvieratá",
  "Starožitnosti a zberateľstvo",
  "Ostatné",
];

function bazarCategory(category: string | null | undefined): string {
  const w = norm(category ?? "");
  if (!w) return "Ostatné";
  let best = "Ostatné";
  let bestScore = 0;
  for (const c of BAZAR_CATEGORIES) {
    const score = wordOverlap(norm(c), w);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Bazar.sk requires ≥ N chars of body text; pad with the title if too short. */
function ensureMinLength(text: string, title: string, min: number): string {
  let t = (text ?? "").trim();
  if (t.length >= min) return t;
  if (title) t = (t + "\n" + title).trim();
  while (t.length < min) t += ".";
  return t;
}

/** A per-ad password that satisfies bazar.sk's "min. 7 znakov" rule. */
function sevenPlus(pass: string | null | undefined): string {
  const p = (pass ?? "").trim();
  return p.length >= 7 ? p : "Klikado1234";
}

/** Slovak local phone format (0…) for a SK portal / SMS verification. */
function localPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = raw.replace(/[^\d]/g, "");
  if (d.startsWith("00421")) d = d.slice(5);
  else if (d.startsWith("421")) d = d.slice(3);
  if (!d.startsWith("0")) d = "0" + d;
  return d;
}

/** Keep only digits from a postcode (e.g. "010 01" → "01001"). */
function normalizeZip(zip: string | null | undefined): string {
  return (zip ?? "").replace(/\D/g, "");
}

function absolute(href: string): string {
  if (href.startsWith("http")) return href;
  return `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
}

function extractAdId(url: string): string {
  const m = url.match(/\/inzerat\/(\d+)/) || url.match(/(\d{5,})/);
  return m ? m[1] : url;
}

/** Parse a bazar.sk ad's view count: "Videné: 12x" / "Zobrazené 1 234". */
function parseViews(body: string): number | undefined {
  const m = body.match(
    /(?:po[čc]et\s+zobrazen[ií]|zobrazen[ée]|viden[ée]|zhliadnut[ií])[:\s]*([\d][\d\s.]*)/i,
  );
  if (!m) return undefined;
  const n = parseInt(m[1].replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Download + re-encode listing images to compact JPEGs bazar.sk accepts. */
async function downloadImages(
  images: ListingPayload["images"],
): Promise<{ name: string; mimeType: string; buffer: Buffer }[]> {
  const ordered = [...images].sort((a, b) => a.position - b.position);
  const out: { name: string; mimeType: string; buffer: Buffer }[] = [];
  for (const [i, img] of ordered.entries()) {
    const res = await fetch(img.url);
    const raw = Buffer.from(await res.arrayBuffer());
    let buffer: Buffer = raw;
    try {
      buffer = await sharp(raw)
        .rotate()
        .resize({
          width: 1200,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      buffer = raw;
    }
    out.push({ name: `photo-${i}.jpg`, mimeType: "image/jpeg", buffer });
  }
  return out;
}
