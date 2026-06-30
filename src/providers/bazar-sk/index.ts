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
      // Map the listing to a real Bazar.sk category + sub-category (so the ad
      // lands where it belongs and isn't removed for mis-categorisation), with
      // "Ostatné" only as a safe fallback. The tiles are JS elements (they set a
      // hidden data[idCategory]); at each wizard step click the sub-category if
      // it's shown, otherwise the main category, by exact tile text.
      const cat = bazarCategoryPath(listing.category, listing.title);
      const targets = [cat.sub, cat.main].filter(Boolean) as string[];
      await ctx.log(
        `Kategória na Bazar.sk: ${cat.main}${cat.sub ? " / " + cat.sub : ""}`,
      );

      for (let step = 0; step < 5; step++) {
        if (await this.hasField(page, "Nadpis")) break;
        let clicked = false;
        for (const t of targets) {
          if (await this.clickTileByText(page, t)) {
            await ctx.log(`Kategória → ${t}`);
            clicked = true;
            break;
          }
        }
        // Fall back to a fuzzy match on the MAIN category only (never fuzzy the
        // sub-category — that could land on a wrong main tile).
        if (!clicked) clicked = await this.clickCategoryTile(page, ctx, cat.main);
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.waitForTimeout(1100);
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

      // Location: bazar.sk's "Lokalita" is an AUTOCOMPLETE — typing a value
      // isn't enough, a suggestion must be chosen or it counts as empty. Try the
      // town first, then the PSČ.
      const zip = normalizeZip(listing.zip);
      await this.fillLocation(
        page,
        ctx,
        [listing.location ?? "", zip.length === 5 ? zip : (listing.zip ?? "")].filter(
          Boolean,
        ),
      );

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

      // Read back the labelled fields so a rejected submit shows which required
      // field is still empty in the logs.
      const readback: Record<string, string> = {};
      for (const lbl of [
        "Nadpis",
        "Text",
        "Cena",
        "Stav",
        "Lokalita",
        "Meno",
        "Telefón",
        "Heslo",
      ]) {
        readback[lbl] = await this.readLabeled(page, lbl);
      }
      const fileCount = await page
        .locator('input[type="file"]')
        .first()
        .evaluate((el) => (el as HTMLInputElement).files?.length ?? 0)
        .catch(() => -1);
      await ctx.log("Hodnoty formulára pred odoslaním", { ...readback, fileCount });

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

  /** Read back the current value of the input/textarea following a label. */
  private async readLabeled(
    page: import("playwright").Page,
    label: string,
  ): Promise<string> {
    for (const tag of ["input", "textarea", "select"] as const) {
      const loc = page.locator(labelXpath(label, tag)).first();
      if ((await loc.count().catch(() => 0)) > 0) {
        return (await loc.inputValue().catch(() => "")) || "∅";
      }
    }
    return "∅";
  }

  /**
   * Fill the "Lokalita" autocomplete and CHOOSE a suggestion — typing alone
   * leaves the field unrecognised by bazar.sk, which then rejects the ad. Tries
   * each candidate (town, then PSČ) until a suggestion is picked.
   */
  private async fillLocation(
    page: import("playwright").Page,
    ctx: ProviderContext,
    candidates: string[],
  ): Promise<void> {
    // The field is most reliably found by its placeholder ("Zadajte lokalitu
    // alebo PSČ"); fall back to the label caption.
    let loc = page
      .locator(
        'input[placeholder*="lokalit" i], input[placeholder*="PSČ" i], input[placeholder*="PSC" i]',
      )
      .first();
    if ((await loc.count().catch(() => 0)) === 0) {
      loc = page.locator(labelXpath("Lokalita", "input")).first();
    }
    if ((await loc.count().catch(() => 0)) === 0) {
      await ctx.log("Lokalita: pole sa nenašlo.");
      return;
    }

    for (const value of candidates.filter(Boolean)) {
      await loc.click().catch(() => {});
      await loc.fill("").catch(() => {});
      await loc.pressSequentially(value, { delay: 90 }).catch(() => {});
      await page.waitForTimeout(1800); // let the autocomplete load
      await this.logStructure(page, ctx);

      // Click the first suggestion, trying many markups, else any visible list
      // item that just appeared; finally keyboard-select it.
      const item = page
        .locator(
          '.ui-menu-item, .ui-autocomplete li, .autocomplete-suggestion, [class*="suggest"] li, [class*="autocomplete"] li, [class*="result"] li, ul[role="listbox"] li, li[role="option"], .pac-item, .dropdown-menu li, .tt-suggestion',
        )
        .filter({ visible: true })
        .first();
      if (await item.count().catch(() => 0)) {
        await item.click({ timeout: 3000 }).catch(() => {});
      } else {
        await loc.press("ArrowDown").catch(() => {});
        await page.waitForTimeout(200);
        await loc.press("Enter").catch(() => {});
      }
      await page.waitForTimeout(500);

      const readback = await loc.inputValue().catch(() => "");
      await ctx.log("Lokalita pokus", { value, readback: readback || "∅" });
      await this.debugShot(page, ctx, "lokalita");
      if (readback && readback.trim().length > 1) return; // success
    }
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
   * Click a category tile by its visible text. The tiles are JS elements (not
   * links) inside the wizard body — explicitly EXCLUDE the header/nav/footer so
   * we never hit the browse megamenu. Prefers an exact name; on a sub-category
   * step where names differ, clicks the closest match, else the first tile.
   */
  private async clickCategoryTile(
    page: import("playwright").Page,
    ctx: ProviderContext,
    wanted: string,
  ): Promise<boolean> {
    // 1) Exact tile whose own text equals the category, not in header/nav/footer.
    if (await this.clickTileByText(page, wanted)) {
      await ctx.log(`Kategória (dlaždica) → ${wanted}`);
      return true;
    }

    // 2) Sub-category step: gather the wizard's category-like texts and click
    // the closest match (else the first).
    const w = norm(wanted);
    const texts: string[] = await page
      .evaluate(() => {
        const bad =
          /prihl|registr|moje inzer|vyh[ľl]ad|sledovan|kontakt|reklama|blog|gdpr|cookies|podmienky|mobiln|ako inzerovat|zvýhodni|napíšte|united|bazar\.sk|prida[ťt] inzer|zalo[žz]te|navrhneme|zmeni[ťt] kateg/i;
        const seen = new Set<string>();
        const out: string[] = [];
        for (const e of Array.from(document.querySelectorAll("a,li,div,span,p"))) {
          const el = e as HTMLElement;
          if (el.closest("header,nav,footer")) continue; // skip megamenu/footer
          // own (direct) text only, so we target the leaf tile label
          const own = Array.from(el.childNodes)
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent ?? "")
            .join("")
            .trim();
          if (own.length < 2 || own.length > 35) continue;
          if (bad.test(own)) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 20 || r.height < 8) continue;
          if (seen.has(own)) continue;
          seen.add(own);
          out.push(own);
        }
        return out;
      })
      .catch(() => [] as string[]);

    if (!texts.length) {
      await ctx.log("Kategórie: žiadne dlaždice na kliknutie.");
      return false;
    }
    let best = texts[0];
    let bs = -1;
    for (const t of texts) {
      const s = wordOverlap(norm(t), w);
      if (s > bs) {
        bs = s;
        best = t;
      }
    }
    await ctx.log(`Kategória (text) → ${best}`);
    await this.clickTileByText(page, best);
    return true;
  }

  /** Click an element whose OWN text equals `text`, outside header/nav/footer. */
  private async clickTileByText(
    page: import("playwright").Page,
    text: string,
  ): Promise<boolean> {
    const xp =
      "xpath=//*[not(ancestor::header) and not(ancestor::nav) and not(ancestor::footer)]" +
      `[normalize-space(text())=${JSON.stringify(text)}]`;
    const loc = page.locator(xp).filter({ visible: true }).first();
    if ((await loc.count().catch(() => 0)) === 0) return false;
    await loc.click({ timeout: 6000 }).catch(() => {});
    return true;
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
    const ensureChecked = async (
      box: import("playwright").Locator,
    ): Promise<boolean> => {
      // The real checkbox is often hidden behind a styled label, so a plain
      // check() can fail — try normal, forced, then set it directly via JS.
      await box.check().catch(() => {});
      if (await box.isChecked().catch(() => false)) return true;
      await box.check({ force: true }).catch(() => {});
      if (await box.isChecked().catch(() => false)) return true;
      await box
        .evaluate((el) => {
          const i = el as HTMLInputElement;
          i.checked = true;
          i.dispatchEvent(new Event("change", { bubbles: true }));
          i.dispatchEvent(new Event("click", { bubbles: true }));
        })
        .catch(() => {});
      return box.isChecked().catch(() => false);
    };

    if (await cb.count().catch(() => 0)) {
      const ok = await ensureChecked(cb);
      await ctx.log(`Súhlas s podmienkami: ${ok ? "zaškrtnutý" : "NEzaškrtnutý"}`);
      if (ok) return;
    }
    // Fallback: the last checkbox on the form is usually the terms box.
    const all = page.locator('form input[type="checkbox"]');
    const n = await all.count().catch(() => 0);
    if (n > 0) await ensureChecked(all.nth(n - 1));
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
    // CRITICAL: if the ad form is still on the page, the submit did NOT go
    // through (e.g. a missing required field). The contact section literally
    // says "...slúži ako kontakt a pre zaslanie overovacieho kódu", so the word
    // "overovacieho kódu" is present even on the form — never ask for an SMS in
    // that case; surface the real problem instead.
    if (await this.hasField(page, "Nadpis")) {
      await this.debugShot(page, ctx, "submit-not-advanced");
      await this.logStructure(page, ctx);
      const t = (
        await page
          .locator("body")
          .innerText()
          .catch(() => "")
      ).replace(/\s+/g, " ");
      const hint =
        t.match(
          /(povinn[ée][^.]{0,90}|vypl[ňn][^.]{0,90}|chýb[^.]{0,90}|chyba[^.]{0,90}|nahra[ďj][^.]{0,60}fotograf[^.]{0,40}|minim[aá]ln[^.]{0,60})/i,
        )?.[0] ?? "formulár sa neodoslal (pravdepodobne chýba povinné pole alebo fotka)";
      throw new Error(
        `Bazar.sk neodoslal inzerát: ${hint}. Pozri screenshot 'submit-not-advanced'.`,
      );
    }

    const text = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    // A genuine verification page has STRONG wording asking to type a code,
    // not just the contact hint. Require that explicit phrasing.
    const wantsCode =
      /(zadajte|opí[šs]te|prepí[šs]te|vlož|vpí[šs]te)[^.]{0,30}k[óo]d|overovac[íi]\s+k[óo]d|SMS\s+k[óo]d|k[óo]d\s+z\s+SMS/i.test(
        text,
      ) && !/inzer[aá]t\s+(bol|je)\s+(prida|zverejnen)/i.test(text);
    if (!wantsCode) return;

    // The page may need a "Poslať/odoslať overovací kód" button pressed to
    // actually send the SMS before showing the code box.
    const sendBtn = page
      .getByRole("button", { name: /(odosla|posla|zasla)[ťt][^.]{0,20}k[óo]d/i })
      .first();
    if (await sendBtn.count().catch(() => 0)) {
      await ctx.log("Spúšťam odoslanie overovacieho SMS kódu");
      await sendBtn.click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

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

// Map a listing (its category text + title) to the right Bazar.sk category and
// sub-category. Ordered keyword rules — the first match wins; anything that
// doesn't match a real category falls back to "Ostatné" (a legitimate catch-all
// with no required specification fields). This keeps ads correctly categorised
// so the portal doesn't remove them for being in the wrong place.
const CATEGORY_RULES: { re: RegExp; main: string; sub?: string }[] = [
  { re: /hra[čc]k|pl[yi][šs]ov|stavebnic|\blego\b|puzzle|spolo[čc]ensk[ée]\s*hr|toy/i, main: "Detské potreby", sub: "Hračky" },
  { re: /ko[čc][ií]k|autosedač|dupač|kojeneck|bábät|babat|pl[ie]nk|detsk[ée]|pre\s*deti|detský\s*bazár/i, main: "Detské potreby" },
  { re: /tri[čc]k|nohavic|mikin|bund|\bšaty\b|sukn|kabát|obuv|topán|tenisk|oble[čc]eni|móda|moda/i, main: "Oblečenie a obuv" },
  { re: /mobil|telef[óo]n|iphone|samsung|smartf[óo]n|huawei|xiaomi/i, main: "Mobily" },
  { re: /notebook|po[čc][ií]ta[čc]|laptop|monitor|kláves|my[šs]\b|gpu|gra[fF]ick[áa]\s*kart|ssd|procesor/i, main: "Počítače" },
  { re: /n[áa]bytok|stoli[čc]k|sedač|posteľ|skriň|komod|\bst[ôo]l\b|matrac|reg[áa]l/i, main: "Nábytok a bývanie" },
  { re: /náradi|vŕta|vrta[čc]|\bp[íi]l|brús|zvára|kompresor|stroj/i, main: "Stroje a náradie" },
  { re: /knih|u[čc]ebnic|rom[áa]n|encyklop/i, main: "Knihy" },
  { re: /bicyk|\bloptа\b|lopt|šport|fitnes|posilň|kor[čc]ul|\blyž|brusl/i, main: "Športové potreby" },
  { re: /zviera|\bpes\b|psík|ma[čc]k|akvár|terár|škrečk|králi|hlodáč|fretk/i, main: "Zvieratá" },
  { re: /\bbyt\b|\bdom\b|pozemok|reality|chat[au]?|chalup|gar[áa][žz]|prenáj|nehnuteľn/i, main: "Reality" },
  { re: /\bauto\b|automobil|\bškoda\b|volkswagen|\bbmw\b|\baudi\b|osobné\s*aut|náhradné\s*diel/i, main: "Autá" },
  { re: /motork|skúter|skuter|moped|štvorkolk|\bmoto\b/i, main: "Motorky" },
  { re: /chladnič|prá[čc]k|televíz|\btv\b|elektro|\brúr|mikrovln|\bfén|žehlič|vysávač/i, main: "Elektro" },
  { re: /gitar|klav[ií]r|\bhusl|\bbubn|hudobn|reproduktor|zosilň|klávesy/i, main: "Hudba" },
  { re: /záhrad|zahrad|stavb|tehl|dlažb|náter|\bplot\b/i, main: "Stavba a záhrada" },
  { re: /zberateľ|starožitn|\bminc|známk|pohľadnic|\bmedail/i, main: "Starožitnosti a zberateľstvo" },
  { re: /kozmetik|krás|parfum|zdravi|vitamín|drogéri/i, main: "Zdravie a krása" },
  { re: /služb|oprav|montáž|doprav|sťahovan/i, main: "Služby" },
  { re: /\bpráca\b|brigád|zamestnan|ponuka\s*prác/i, main: "Práca" },
];

function bazarCategoryPath(
  category: string | null | undefined,
  title: string | null | undefined,
): { main: string; sub?: string } {
  const hay = `${category ?? ""} ${title ?? ""}`.toLowerCase();
  for (const r of CATEGORY_RULES) {
    if (r.re.test(hay)) return { main: r.main, sub: r.sub };
  }
  return { main: "Ostatné" };
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
