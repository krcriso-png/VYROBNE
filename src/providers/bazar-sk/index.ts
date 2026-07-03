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
      // Bazar.sk step 1 is CATEGORY ONLY. The page has a grid of tiles
      // (.s-categories[data-cat-id="N"]) plus a "napovedač" whisperer text box.
      // Clicking a MAIN tile AJAX-loads its sub-categories into #piSubDiv;
      // picking a leaf sub-category advances to step 2 (the ad form with the
      // "Nadpis" field). We select by the real data-cat-id — NEVER by tile text,
      // which used to match the header megamenu links and navigate away to the
      // homepage (that was the "publikuje sa" / empty-form bug).
      const cat = bazarCategoryPath(listing.category, listing.title);
      await ctx.log(
        `Kategória na Bazar.sk: ${cat.main} (#${cat.id})${
          cat.sub ? " / " + cat.sub : ""
        }`,
      );
      const reached = await this.selectCategory(page, ctx, cat);
      if (!reached) {
        await this.logStructure(page, ctx);
        throw new Error(
          "Bazar.sk: nepodarilo sa dostať na formulár inzerátu (krok 1 – výber kategórie zlyhal). Pozri screenshoty 'add-cat-*'.",
        );
      }

      // --- Step 2: Inzerát ----------------------------------------------
      await ctx.log("Vypĺňam formulár inzerátu na Bazar.sk");
      await this.logStructure(page, ctx);

      // Title + description. bazar.sk counts characters on real key events, so
      // a plain value-set leaves its "Napísaných 0 znakov (min. 20)" counter at
      // zero and rejects the ad — type them for real.
      await this.typeReactive(
        page,
        page.locator('form [name="data[title]"]').first(),
        listing.title,
      );
      // Bazar.sk requires at least 20 characters of body text.
      const body = ensureMinLength(listing.description, listing.title, 20);
      await this.typeReactive(
        page,
        page.locator('form [name="data[content]"]').first(),
        body,
      );

      // Price — the amount field is the form input with class "price"
      // (name data[param_1] for this category). Filling by class is
      // category-independent and reliable.
      if (listing.price != null) {
        const priceInput = page.locator("form input.price").first();
        if ((await priceInput.count().catch(() => 0)) > 0) {
          await this.typeReactive(page, priceInput, String(listing.price));
        } else {
          await this.fillLabeled(page, "Cena", String(listing.price));
        }
      }

      // "Stav" (condition) may be a dropdown OR radio buttons depending on the
      // category (Detské potreby uses radios: data[param_3]). Try the select
      // first; required radios are handled generically below.
      await this.selectLabeled(page, "Stav", /použit|pouzit|nové|nove|zachoval/i);

      // Location: bazar.sk's "Lokalita" is a CLICK widget (kraj → okres → mesto),
      // not a text field. Open it and pick the listing's town/region.
      await this.fillLocation(
        page,
        ctx,
        [listing.location ?? "", normalizeZip(listing.zip)].filter(Boolean),
      );

      // Any remaining required <select> in the category Špecifikácia block —
      // pick its first real option so a category with extra fields still submits.
      await this.fillRequiredSelects(page, ctx);

      // Required radio groups (Stav and other category params like data[param_3]
      // / data[param_4]) — check the first option of any group that has none
      // selected, so the form isn't rejected for a missing required parameter.
      await this.fillRequiredRadios(page, ctx);

      // Safety: if any earlier step navigated us away from the add form (e.g. a
      // stray click during the location autocomplete), stop now — don't upload
      // photos to the homepage or "submit" nothing and report a false success.
      if (!(await this.hasField(page, "Nadpis"))) {
        await this.debugShot(page, ctx, "lost-form");
        throw new Error(
          `Bazar.sk: počas vypĺňania sme vypadli z formulára (skončili sme na ${page.url()}). Inzerát sa nezverejnil.`,
        );
      }

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

      // Contact block — bazar.sk uses fixed field names for the advertiser name
      // and password, and dynamic hashed names ending in [contact] for phone /
      // e-mail. Fill by the real names (fall back to the label caption).
      const jmeno =
        listing.contactName ||
        listing.email?.split("@")[0] ||
        "Inzerent";
      await this.typeReactive(
        page,
        page.locator('form [name="data[Agents][agent][name]"]').first(),
        jmeno,
      );
      const phone = localPhone(ctx.secrets?.verifyPhone || listing.phone);
      // The two contact inputs are distinguished by class: input.phone and
      // input.email (their names are dynamic hashes). Phone carries the SMS
      // verification number, so it's the important one.
      if (phone) {
        await this.typeReactive(page, page.locator("form input.phone").first(), phone);
      }
      if (listing.email) {
        await this.typeReactive(
          page,
          page.locator("form input.email").first(),
          listing.email,
        );
      }
      // Per-ad password (min 7 chars). Its "Ešte min. 7 znakov" validator counts
      // on key events, so type it for real.
      const adPass = sevenPlus(ctx.secrets?.password);
      await this.typeReactive(
        page,
        page.locator('form [name="data[password]"]').first(),
        adPass,
      );

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

      // Read back by the REAL field names too (the label mapping can miss on
      // bazar.sk's params) — this shows exactly what will be submitted.
      const byName = await page
        .evaluate(() => {
          const get = (n: string) =>
            (
              document.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value ??
              ""
            ).slice(0, 40) || "∅";
          const contacts = Array.from(
            document.querySelectorAll<HTMLInputElement>(
              'form input[name$="[contact]"]',
            ),
          )
            .map((e) => e.value)
            .filter(Boolean);
          const radios = Array.from(
            document.querySelectorAll<HTMLInputElement>(
              'form input[type="radio"]:checked',
            ),
          ).map((e) => e.name);
          return {
            title: get("data[title]"),
            content: get("data[content]"),
            param_1: get("data[param_1]"),
            locationName: get("data[locationName]"),
            idCity: get("data[idCity]"),
            name: get("data[Agents][agent][name]"),
            password: document.querySelector<HTMLInputElement>(
              '[name="data[password]"]',
            )?.value
              ? "✓"
              : "∅",
            contacts,
            checkedRadios: radios,
          };
        })
        .catch(() => null);
      await ctx.log("Polia podľa názvu (reálne)", byName ?? { error: true });

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

      // Declare success ONLY with a real ad link — never on vague page text.
      // If we didn't land on a real ad, it did NOT publish (e.g. the flow ended
      // on the homepage / search), so report a clear error instead of lying.
      const remoteUrl = urlIsAd ? url : adLink ? absolute(adLink) : "";
      if (!remoteUrl || rejected) {
        const hint = text.replace(/\s+/g, " ").slice(0, 300);
        throw new Error(
          `Bazar.sk: inzerát sa nepodarilo zverejniť (nedostali sme odkaz na inzerát; skončili sme na ${url}). ${hint}`,
        );
      }
      const remoteId = extractAdId(remoteUrl);

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

  /**
   * Fill a field the way bazar.sk's live validators/counters expect: real key
   * events. A plain value-set (.fill) doesn't fire keyup, so its character
   * counters stay at 0 and required-length checks fail ("Napísaných 0 znakov",
   * "Ešte min. 7 znakov"). We clear it, type it, then nudge input/keyup/change.
   */
  private async typeReactive(
    page: import("playwright").Page,
    loc: import("playwright").Locator,
    value: string,
  ): Promise<boolean> {
    if ((await loc.count().catch(() => 0)) === 0) return false;
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc.click({ timeout: 3000 }).catch(() => {});
    await loc.fill("").catch(() => {});
    let typed = true;
    await loc.pressSequentially(value, { delay: 12 }).catch(() => {
      typed = false;
    });
    if (!typed) await loc.fill(value).catch(() => {});
    // Nudge any validator that listens for keyup/change/blur specifically.
    await loc
      .evaluate((el) => {
        for (const t of ["input", "keyup", "keydown", "change", "blur"]) {
          el.dispatchEvent(new Event(t, { bubbles: true }));
        }
      })
      .catch(() => {});
    return true;
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

  /** Fill a field by its exact name attribute; fall back to the label caption. */
  private async fillByNameOrLabel(
    page: import("playwright").Page,
    name: string,
    label: string,
    value: string,
    tag: "input" | "textarea" = "input",
  ): Promise<void> {
    const byName = page.locator(`${tag}[name="${name}"]`).first();
    if ((await byName.count().catch(() => 0)) > 0) {
      await byName.fill(value).catch(() => {});
      return;
    }
    await this.fillLabeled(page, label, value, tag);
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
    // Identify the location autocomplete input and tag it. bazar.sk's location
    // field is a "whisperer" text input near the hidden data[locationName]. We
    // pick it robustly (whisperer class → placeholder hint → the visible text
    // input closest to data[locationName] → the input after the "Lokalita"
    // label) and dump every visible text input (name + class + placeholder) so
    // the field can be identified from the logs if matching still misses.
    const tagInfo = await page
      .evaluate(() => {
        const isVisible = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          return r.width > 2 && r.height > 2 && el.offsetParent !== null;
        };
        const texts = Array.from(
          document.querySelectorAll<HTMLInputElement>("input"),
        ).filter(
          (i) =>
            ["text", "search", "tel"].includes((i.type || "text").toLowerCase()) &&
            isVisible(i),
        );
        const dump = texts.map((i) => ({
          name: i.getAttribute("name") || "",
          cls: (i.className || "").slice(0, 40),
          ph: i.placeholder || "",
        }));

        let target: HTMLInputElement | null = null;
        // 1) a whisperer input that isn't the category one
        target =
          texts.find(
            (i) =>
              /whisper/i.test(i.className) &&
              i.getAttribute("name") !== "input-category",
          ) ?? null;
        // 2) placeholder hint (obec / mesto / PSČ / lokalita / okres)
        if (!target)
          target =
            texts.find((i) =>
              /obec|mesto|ps[čc]|lokalit|okres|region|kraj/i.test(
                i.placeholder || "",
              ),
            ) ?? null;
        // 3) the visible text input closest (in DOM order) to data[locationName]
        if (!target) {
          const hidden = document.querySelector('[name="data[locationName]"]');
          if (hidden) {
            let best: HTMLInputElement | null = null;
            let bestDist = Infinity;
            const all = Array.from(document.querySelectorAll<HTMLElement>("*"));
            const hiddenIdx = all.indexOf(hidden as HTMLElement);
            texts.forEach((i) => {
              const idx = all.indexOf(i);
              const dist = Math.abs(idx - hiddenIdx);
              if (dist < bestDist) {
                bestDist = dist;
                best = i;
              }
            });
            target = best;
          }
        }
        // 4) the input after the "Lokalita" label
        if (!target) {
          const label = Array.from(document.querySelectorAll<HTMLElement>("*"))
            .filter((e) =>
              /^Lokalita/i.test(
                Array.from(e.childNodes)
                  .filter((n) => n.nodeType === 3)
                  .map((n) => n.textContent ?? "")
                  .join("")
                  .trim(),
              ),
            )
            .pop();
          if (label) {
            target =
              texts.find(
                (i) =>
                  (label.compareDocumentPosition(i) &
                    Node.DOCUMENT_POSITION_FOLLOWING) !==
                  0,
              ) ?? null;
          }
        }
        if (target) target.setAttribute("data-klikado-loc", "1");
        return {
          dump,
          chosen: target
            ? {
                name: target.getAttribute("name") || "",
                cls: (target.className || "").slice(0, 40),
                ph: target.placeholder || "",
              }
            : null,
        };
      })
      .catch(() => ({ dump: [] as unknown[], chosen: null }));
    await ctx.log("Lokalita – viditeľné polia", {
      inputs: tagInfo.dump,
      chosen: tagInfo.chosen,
    });
    if (!tagInfo.chosen) {
      await ctx.log("Lokalita: viditeľné pole sa nenašlo.");
      return;
    }
    const locName = page.locator('input[name="data[locationName]"]').first();
    const onForm = () =>
      page.url().includes("pridanie-neprihlaseny") ||
      page.url().includes("#form");
    const town = candidates.find((c) => c && !/^\d+$/.test(c)) || candidates[0] || "";

    // 1) Open the location picker. bazar.sk has NO visible location text input —
    // the picker opens on click of an element near the "Lokalita" label.
    const trig = await page
      .evaluate(() => {
        const own = (e: Element) =>
          Array.from(e.childNodes)
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent ?? "")
            .join("")
            .trim();
        let t: Element | null = document.querySelector(
          '[class*="location"]:not(input):not(script):not(style),[class*="lokalit"]:not(input)',
        );
        if (!t) {
          const label = Array.from(document.querySelectorAll("*"))
            .filter((e) => /lokalit/i.test(own(e)))
            .pop();
          const scope =
            (label && (label.closest("div,fieldset,tr,li,section") as Element)) ||
            document.body;
          t =
            Array.from(scope.querySelectorAll("a,button,span,div,input")).find(
              (el) => {
                const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
                const cls = String((el as HTMLElement).className || "");
                return (
                  (/zadaj|vyber|zvo[ľl]|prida[ťt]|cel[áa]\s*sr|obec|mesto|kraj|okres|lokalit/i.test(
                    txt,
                  ) &&
                    txt.length < 40) ||
                  /location|lokalit|geo|region/i.test(cls)
                );
              },
            ) || null;
        }
        // Never use an off-site link as the trigger.
        if (
          t &&
          t.tagName === "A" &&
          (t as HTMLAnchorElement).getAttribute("href") &&
          !/^#|^javascript:/i.test(
            (t as HTMLAnchorElement).getAttribute("href") || "",
          )
        )
          t = null;
        if (!t) return null;
        t.setAttribute("data-klikado-loctrigger", "1");
        return {
          text: (t.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
          cls: String((t as HTMLElement).className || "").slice(0, 40),
          tag: t.tagName,
        };
      })
      .catch(() => null);
    await ctx.log("Lokalita – spúšťač", trig ?? { found: false });

    if (trig) {
      await page
        .locator('[data-klikado-loctrigger="1"]')
        .first()
        .click({ timeout: 4000 })
        .catch(() => {});
      await page.waitForTimeout(1300);
    }
    await this.debugShot(page, ctx, "lokalita-open");
    if (!onForm()) {
      await ctx.log("Lokalita: po otvorení sme mimo formulára — končím.");
      return;
    }

    // 2) Dump the opened panel and find its search box (if any).
    const panel = await page
      .evaluate(() => {
        const known = /title|video|param_|Agents|password|content|agreement/;
        const isVis = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          return r.width > 2 && r.height > 2 && el.offsetParent !== null;
        };
        let search: HTMLInputElement | null = null;
        for (const i of Array.from(
          document.querySelectorAll<HTMLInputElement>("input"),
        )) {
          const type = (i.type || "text").toLowerCase();
          if (!["text", "search"].includes(type)) continue;
          if (!isVis(i)) continue;
          if (known.test(i.getAttribute("name") || "")) continue;
          if (i.value) continue;
          search = i;
          if (
            i.closest(
              '[class*="modal"],[class*="overlay"],[class*="dialog"],[class*="popup"],[role="dialog"]',
            )
          )
            break;
        }
        if (search) search.setAttribute("data-klikado-locsearch", "1");
        const items: string[] = [];
        for (const el of Array.from(
          document.querySelectorAll<HTMLElement>(
            '[class*="modal"] *,[class*="overlay"] *,[class*="popup"] *,[role="dialog"] *,[class*="location"] *,[class*="region"] *,[class*="geo"] *',
          ),
        )) {
          if (el.closest("header,nav,footer")) continue;
          if (el.querySelector("*")) continue;
          const t = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (t.length < 2 || t.length > 40) continue;
          items.push(t);
        }
        return {
          hasSearch: !!search,
          searchName: search?.getAttribute("name") || "",
          items: Array.from(new Set(items)).slice(0, 30),
        };
      })
      .catch(() => ({ hasSearch: false, searchName: "", items: [] as string[] }));
    await ctx.log("Lokalita – panel", panel);

    // 3) If a search box appeared, type the town and click the best result.
    if (panel.hasSearch && town) {
      const s = page.locator('[data-klikado-locsearch="1"]').first();
      await s.click().catch(() => {});
      await s.fill("").catch(() => {});
      await s.type(town, { delay: 60 }).catch(() => {});
      await page.waitForTimeout(1600);
      const picked = await page
        .evaluate((t: string) => {
          const norm = (x: string) =>
            x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
          const nt = norm(t);
          const input = document.querySelector<HTMLElement>(
            '[data-klikado-locsearch="1"]',
          );
          const ir = input ? input.getBoundingClientRect() : null;
          const rows: { el: HTMLElement; txt: string }[] = [];
          for (const el of Array.from(
            document.querySelectorAll<HTMLElement>("li,a,div,span,p,td"),
          )) {
            if (el.closest("header,nav,footer")) continue;
            if (el.querySelector("li,ul,input,form")) continue;
            const r = el.getBoundingClientRect();
            if (ir && r.top < ir.top - 8) continue;
            if (r.width < 20 || r.height < 8 || r.height > 60) continue;
            const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
            if (txt.length < 2 || txt.length > 60) continue;
            rows.push({ el, txt });
          }
          let best = rows.find((r) => norm(r.txt).includes(nt));
          if (!best) best = rows[0];
          if (best) best.el.setAttribute("data-klikado-locpick", "1");
          return {
            picked: best ? best.txt : "",
            options: rows.map((r) => r.txt).slice(0, 12),
          };
        }, town)
        .catch(() => ({ picked: "", options: [] as string[] }));
      await ctx.log("Lokalita – výsledok hľadania", {
        town,
        picked: picked.picked || "∅",
        options: picked.options,
      });
      if (picked.picked) {
        await page
          .locator('[data-klikado-locpick="1"]')
          .first()
          .click({ timeout: 3000 })
          .catch(() => {});
        await page.waitForTimeout(900);
      }
    }

    const nameVal = await locName.inputValue().catch(() => "");
    await ctx.log("Lokalita – výsledok", {
      locationName: nameVal || "∅",
      onForm: onForm(),
    });
    await this.debugShot(page, ctx, "lokalita");
  }

  /**
   * Select the first option of every required radio group that has none chosen
   * (Stav / "Typ" and other category params like data[param_3]/data[param_4]
   * render as radios). bazar.sk uses STYLED radios whose real state is tracked
   * by its own JS, so setting the native .checked isn't enough — we must click
   * the visible label/control so the site registers the choice. Otherwise the
   * form is rejected with "nevyplnené povinné údaje / Typ".
   */
  private async fillRequiredRadios(
    page: import("playwright").Page,
    ctx: ProviderContext,
  ): Promise<void> {
    // Find, per group, the first radio's id/value so we can click its label.
    const groups = await page
      .evaluate(() => {
        const names: string[] = [];
        const seen = new Set<string>();
        for (const el of Array.from(
          document.querySelectorAll<HTMLInputElement>('form input[type="radio"]'),
        )) {
          const n = el.name || "";
          if (!n || seen.has(n)) continue;
          seen.add(n);
          names.push(n);
        }
        const out: { name: string; id: string; checked: boolean }[] = [];
        for (const n of names) {
          const els = Array.from(
            document.querySelectorAll<HTMLInputElement>(
              `form input[type="radio"][name="${CSS.escape(n)}"]`,
            ),
          );
          const anyChecked = els.some((e) => e.checked);
          const first = els[0];
          out.push({
            name: n,
            id: first?.id || "",
            checked: anyChecked,
          });
        }
        return out;
      })
      .catch(() => [] as { name: string; id: string; checked: boolean }[]);

    const clicked: string[] = [];
    for (const g of groups) {
      if (g.checked) continue;
      let ok = false;
      // 1) Click the <label for=id> (styled radios are driven via the label).
      if (g.id) {
        const lbl = page.locator(`label[for="${g.id}"]`).first();
        if ((await lbl.count().catch(() => 0)) > 0) {
          await lbl.click({ timeout: 2500 }).catch(() => {});
          ok = await page
            .locator(`input[id="${g.id}"]`)
            .isChecked()
            .catch(() => false);
        }
      }
      // 2) Force-click the radio itself.
      if (!ok) {
        const radio = page
          .locator(`form input[type="radio"][name="${g.name}"]`)
          .first();
        await radio.click({ force: true, timeout: 2500 }).catch(() => {});
        ok = await radio.isChecked().catch(() => false);
        // 3) Last resort: set it via JS and fire events.
        if (!ok) {
          await radio
            .evaluate((el) => {
              const i = el as HTMLInputElement;
              i.checked = true;
              i.dispatchEvent(new Event("click", { bubbles: true }));
              i.dispatchEvent(new Event("change", { bubbles: true }));
            })
            .catch(() => {});
        }
      }
      clicked.push(`${g.name}${ok ? "✓" : ""}`);
    }
    if (clicked.length) {
      await ctx.log("Povinné prepínače – kliknuté (prvá možnosť)", { clicked });
    }
  }

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

    // Required free-text / number inputs (category specifics like "Rok výroby",
    // "Najazdené km" for cars). Fill any still-empty REQUIRED input with a
    // sensible default so the ad submits regardless of category. Skip the fields
    // we set explicitly elsewhere and the optional ones.
    const filled = await page
      .evaluate(() => {
        const out: string[] = [];
        const year = new Date().getFullYear();
        const skip = /nadpis|popis|text|cena|psc|lokalit|mail|email|telef|meno|heslo|youtube|name|nazov|title/i;
        for (const el of Array.from(
          document.querySelectorAll<HTMLInputElement>("form input"),
        )) {
          const type = (el.type || "text").toLowerCase();
          if (!["text", "number", "tel"].includes(type)) continue;
          const required =
            el.required || el.getAttribute("aria-required") === "true";
          if (!required) continue;
          if (el.value && el.value.trim()) continue; // already filled
          const id = (el.getAttribute("name") || el.id || "").toLowerCase();
          if (skip.test(id)) continue;
          // Build a default from the field's label/name.
          const labelText = (
            el.closest("tr")?.textContent ||
            el.getAttribute("placeholder") ||
            id ||
            ""
          ).toLowerCase();
          let val = "1";
          if (/rok|year/.test(labelText)) val = String(year);
          else if (/km|najazd|nájazd/.test(labelText)) val = "100000";
          else if (/objem|ccm|kw|výkon|vykon/.test(labelText)) val = "1";
          el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          out.push(`${id || labelText.slice(0, 20)}=${val}`);
        }
        return out;
      })
      .catch(() => [] as string[]);
    if (filled.length) {
      await ctx.log("Doplnené povinné polia (genericky)", { filled });
    }
  }

  /**
   * Step 1 — pick the category. Click the MAIN tile by its real data-cat-id
   * (fires the AJAX sub-category load into #piSubDiv), then keep choosing the
   * best sub-category tile until step 2 (the ad form with "Nadpis") appears.
   * Falls back to the whisperer text box if the tile isn't found. Returns true
   * once the ad form is reached.
   */
  private async selectCategory(
    page: import("playwright").Page,
    ctx: ProviderContext,
    cat: { id: number; main: string; sub?: string },
  ): Promise<boolean> {
    const clicked = await this.clickCatTile(page, cat.id);
    if (clicked) {
      await ctx.log(`Kategória → ${cat.main} (#${cat.id})`);
    } else {
      await ctx.log(`Dlaždica #${cat.id} sa nenašla — skúšam napovedač.`);
      await this.useWhisperer(page, ctx, cat.sub ?? cat.main);
    }

    // The sub-category panel loads by AJAX and can take a few seconds — don't
    // give up after one look. Each round: wait for the panel (or the ad form)
    // to appear, then pick a sub-category. Only stop once the form is reached or
    // we've had several truly-empty rounds.
    let emptyRounds = 0;
    for (let i = 0; i < 9; i++) {
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await this.waitForSubPanel(page);
      await page.waitForTimeout(500);
      await this.debugShot(page, ctx, `add-cat-${i}`);
      if (await this.hasField(page, "Nadpis")) return true;
      const advanced = await this.advanceSubcategory(
        page,
        ctx,
        cat.sub ?? cat.main,
      );
      if (advanced) {
        emptyRounds = 0;
        continue;
      }
      // Nothing to pick yet — try a "Pokračovať" submit, else wait for the AJAX
      // and retry. Give up only after 3 consecutive empty rounds.
      if (await this.clickContinue(page)) {
        emptyRounds = 0;
        continue;
      }
      if (++emptyRounds >= 3) break;
      await page.waitForTimeout(1500);
    }
    return await this.hasField(page, "Nadpis");
  }

  /**
   * Wait for the AJAX sub-category panel to actually appear after a category
   * click. The definitive marker is the "zmeniť kategóriu" control that the
   * loaded panel shows; the ad form's "Nadpis" also counts (deeper leaf that
   * skipped straight to step 2).
   */
  private async waitForSubPanel(
    page: import("playwright").Page,
  ): Promise<boolean> {
    return page
      .waitForFunction(
        () => {
          const t = document.body?.innerText || "";
          if (/zmeni[ťt]\s+kateg/i.test(t)) return true;
          if (/Nadpis/i.test(t)) return true;
          const sub = document.querySelector("#piSubDiv");
          return !!sub && (sub.textContent || "").trim().length > 15;
        },
        { timeout: 9000 },
      )
      .then(() => true)
      .catch(() => false);
  }

  /** Click a category tile by its data-cat-id (fires the AJAX sub-cat load). */
  private async clickCatTile(
    page: import("playwright").Page,
    id: number,
  ): Promise<boolean> {
    const tile = page.locator(`.s-categories[data-cat-id="${id}"]`).first();
    if ((await tile.count().catch(() => 0)) === 0) return false;
    await tile.scrollIntoViewIfNeeded().catch(() => {});
    // The click handler lives on the tile or its .main-cat label span.
    const label = tile.locator(".main-cat, .sub-cat, span").first();
    const target = (await label.count().catch(() => 0)) ? label : tile;
    await target.click({ timeout: 6000 }).catch(() => {});
    // Belt-and-braces: also click the tile itself in case the handler is there.
    if (!(await this.hasField(page, "Nadpis"))) {
      await tile.click({ timeout: 3000 }).catch(() => {});
    }
    return true;
  }

  /**
   * Choose a sub-category inside the AJAX-loaded #piSubDiv panel. Bazar.sk
   * renders the leaf sub-categories NOT as <a> links but as clickable
   * <span>/<div> elements (they never appear in the page's link list), so we
   * scope strictly to the loaded panel and click the best matching clickable
   * element regardless of tag. Always dumps the panel's real candidates to the
   * log so the structure can be verified. A <select> (if any) is handled first.
   */
  private async advanceSubcategory(
    page: import("playwright").Page,
    ctx: ProviderContext,
    wanted: string,
  ): Promise<boolean> {
    const w = norm(wanted);

    // <select> sub-category (needs selectOption, not a click) — handle first.
    const sel = page
      .locator("#piSubDiv select, #piSub select, .categories-sub select")
      .first();
    if (await sel.count().catch(() => 0)) {
      const opts = await sel
        .locator("option")
        .evaluateAll((o) =>
          o.map((e) => ({
            value: (e as HTMLOptionElement).value,
            text: (e.textContent ?? "").trim(),
          })),
        )
        .catch(() => [] as { value: string; text: string }[]);
      const real = opts.filter(
        (o) => o.value && !/^0?$/.test(o.value) && !/vyberte|zvo[ľl]te/i.test(o.text),
      );
      if (real.length) {
        let pick = real[0];
        let bs = -1;
        for (const o of real) {
          const s = wordOverlap(norm(o.text), w);
          if (s > bs) {
            bs = s;
            pick = o;
          }
        }
        if (bs <= 0) pick = real.find((o) => /ostatn/i.test(o.text)) ?? real[0];
        await sel.selectOption(pick.value).catch(() => {});
        await ctx.log(`Podkategória (select) → ${pick.text}`);
        return true;
      }
    }

    // Clickable sub-category elements (any tag). Search the whole <body> but
    // exclude header/nav/footer and the initial main-category grid, so we catch
    // the sub-category items wherever the AJAX rendered them. Rich diagnostics
    // are returned so we can see exactly where the items live.
    // Let the page settle first — the hash nav + ad iframes can otherwise tear
    // down the execution context mid-evaluate.
    await page.waitForLoadState("networkidle").catch(() => {});
    const result = await page
      .evaluate((wantWords: string) => {
        const strip = (s: string) =>
          s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const bad =
          /zmeni[ťt]\s+kateg|prihl[aá]s|zalo[žz]te|nov[ée]\s+konto|registr|reklama|^kontakt$|^blog$|gdpr|cookies|podmienky\s+inzercie|mobiln[áa]\s+verzia|prid[áa]vate|ako\s+inzerova|united\s+classif|^bazar\.sk|vyh[ľl]ad[áa]|sledovanie|moje\s+inzer|zvýhodni|napí[šs]te|navrhneme|alebo\s+si|vyberte\s+kateg/i;

        const bodyText = document.body?.innerText || "";
        const diag = {
          iframes: Array.from(document.querySelectorAll("iframe"))
            .map((f) => f.getAttribute("src") || f.id || "?")
            .slice(0, 6),
          piSubLen: (
            document.querySelector("#piSubDiv")?.textContent || ""
          ).trim().length,
          hasSubText:
            /autosedač|hračk|ko[čc][ií]k|oble[čc]en|ostatn[ée]\s+detsk/i.test(
              bodyText,
            ),
          zmenit: /zmeni[ťt]\s+kateg/i.test(bodyText),
        };

        const want = new Set(
          strip(wantWords)
            .split(/[^a-z0-9]+/)
            .filter((x) => x.length > 2),
        );

        type Cand = { el: Element; txt: string; marked: boolean };
        const seen = new Set<string>();
        const list: Cand[] = [];
        const nodes = Array.from(
          document.body.querySelectorAll<HTMLElement>(
            "a,span,li,div,td,p,button,[rel],[data-cat-id],[data-sef-name]",
          ),
        );
        for (const el of nodes) {
          if (el.closest("header,nav,footer")) continue; // skip chrome/megamenu
          if (el.closest(".category-list")) continue; // skip the 20 main tiles
          const own = Array.from(el.childNodes)
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent ?? "")
            .join("")
            .replace(/\s+/g, " ")
            .trim();
          const full = (el.textContent || "").replace(/\s+/g, " ").trim();
          const txt = own || full;
          if (txt.length < 2 || txt.length > 45) continue;
          if (bad.test(txt)) continue;
          const marked =
            el.hasAttribute("rel") ||
            el.hasAttribute("data-cat-id") ||
            el.hasAttribute("data-sef-name") ||
            el.classList.contains("sub-cat") ||
            el.classList.contains("main-cat") ||
            el.tagName === "A";
          if (!marked && el.querySelector("*")) continue; // generic → leaf only
          const r = el.getBoundingClientRect();
          if (r.width < 10 || r.height < 6) continue;
          if (seen.has(txt)) continue;
          seen.add(txt);
          list.push({ el, txt, marked });
        }

        let best: Cand | null = null;
        let bestScore = -1;
        let first: Cand | null = null;
        let ostatne: Cand | null = null;
        for (const c of list) {
          if (!first) first = c;
          if (!ostatne && /ostatn/i.test(c.txt)) ostatne = c;
          let score = 0;
          for (const word of strip(c.txt).split(/[^a-z0-9]+/))
            if (want.has(word)) score++;
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
        const pick = bestScore > 0 ? best : ostatne ?? first;
        if (pick) pick.el.setAttribute("data-klikado-subcat", "1");
        return {
          dump: list.slice(0, 30).map((c) => c.txt),
          picked: pick ? pick.txt : "",
          tag: pick ? pick.el.tagName : "",
          diag,
        };
      }, wanted)
      .catch((e) => ({
        dump: [] as string[],
        picked: "",
        tag: "",
        diag: null as unknown,
        error: String(e),
      }));

    await ctx.log("Podkategórie – kandidáti", {
      count: result.dump.length,
      items: result.dump,
      picked: result.picked || "∅",
      tag: result.tag || "∅",
      diag: result.diag,
      error: (result as { error?: string }).error ?? null,
    });

    if (result.picked) {
      await page
        .locator('[data-klikado-subcat="1"]')
        .first()
        .click({ timeout: 6000 })
        .catch(() => {});
      await ctx.log(`Podkategória → ${result.picked}`);
      return true;
    }
    return false;
  }

  /** Type into the "napovedač" whisperer and pick its first suggestion. */
  private async useWhisperer(
    page: import("playwright").Page,
    ctx: ProviderContext,
    text: string,
  ): Promise<void> {
    const inp = page
      .locator('input[name="input-category"], input.whisperer.category')
      .first();
    if ((await inp.count().catch(() => 0)) === 0) return;
    await inp.click().catch(() => {});
    await inp.fill(text).catch(() => {});
    await page.waitForTimeout(1800);
    const sugg = page
      .locator(
        '.whisperer-items li, .whisperer-item, ul.whisperer li, .ui-autocomplete li, .whisperer-list li',
      )
      .first();
    if (await sugg.count().catch(() => 0)) {
      await sugg.click({ timeout: 4000 }).catch(() => {});
      await ctx.log(`Napovedač kategórie → "${text}"`);
    } else {
      await page.keyboard.press("Enter").catch(() => {});
    }
  }

  /** Click a "Pokračovať"/"Ďalej" submit within the add form, if present. */
  private async clickContinue(
    page: import("playwright").Page,
  ): Promise<boolean> {
    const btn = page
      .locator(
        '.edit-form button[type="submit"], .edit-form input[type="submit"], button.continue',
      )
      .filter({ visible: true })
      .first();
    if ((await btn.count().catch(() => 0)) === 0) return false;
    await btn.click({ timeout: 6000 }).catch(() => {});
    return true;
  }

  /**
   * Tick the required "Súhlasím s podmienkami inzercie" checkbox
   * (data[agreementChk]). A real click fires bazar.sk's own handler; a plain
   * JS .checked=true left the box visually unchecked and the ad was rejected.
   */
  private async checkTerms(
    page: import("playwright").Page,
    ctx: ProviderContext,
  ): Promise<void> {
    const box = page.locator('form input[name="data[agreementChk]"]').first();
    const isOn = () => box.isChecked().catch(() => false);
    let ok = false;

    if ((await box.count().catch(() => 0)) > 0) {
      const id = await box.getAttribute("id").catch(() => null);
      // 1) A real click on the checkbox (fires the site's change handler).
      await box.click({ timeout: 3000 }).catch(() => {});
      ok = await isOn();
      // 2) Click its <label for=id>.
      if (!ok && id) {
        await page
          .locator(`label[for="${id}"]`)
          .first()
          .click({ timeout: 2500 })
          .catch(() => {});
        ok = await isOn();
      }
      // 3) Click the visible "Súhlasím … podmienkami" text.
      if (!ok) {
        await page
          .locator(
            'xpath=//*[contains(normalize-space(.),"hlas") and contains(normalize-space(.),"podmienkami")]',
          )
          .last()
          .click({ timeout: 2500 })
          .catch(() => {});
        ok = await isOn();
      }
      // 4) Force-click, then a full JS event set as last resort.
      if (!ok) {
        await box.check({ force: true }).catch(() => {});
        ok = await isOn();
      }
      if (!ok) {
        await box
          .evaluate((el) => {
            const i = el as HTMLInputElement;
            i.checked = true;
            for (const t of ["click", "input", "change"]) {
              i.dispatchEvent(new Event(t, { bubbles: true }));
            }
          })
          .catch(() => {});
        ok = await isOn();
      }
    }
    await ctx.log(`Súhlas s podmienkami: ${ok ? "zaškrtnutý" : "NEzaškrtnutý"}`);
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
      // Pinpoint the fields bazar.sk marked invalid (it adds an error/red class
      // and/or an inline .error message) so we know EXACTLY what's still missing.
      const invalid = await page
        .evaluate(() => {
          const out: string[] = [];
          for (const el of Array.from(
            document.querySelectorAll<HTMLElement>(
              'form .error,[class*="error"],[class*="invalid"],[class*="red"],[class*="required-"],.msg-box:not(.hide)',
            ),
          )) {
            if (el.closest("header,nav,footer")) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
            const near =
              el.closest("[class]")?.className?.toString().slice(0, 40) || "";
            if (txt) out.push(`${near}: ${txt.slice(0, 60)}`);
          }
          const priceOpt = document.querySelector<HTMLSelectElement>(
            '[name="data[priceOptions]"]',
          );
          return {
            invalid: Array.from(new Set(out)).slice(0, 15),
            priceOptions: priceOpt ? priceOpt.value : "n/a",
          };
        })
        .catch(() => ({ invalid: [] as string[], priceOptions: "n/a" }));
      await ctx.log("Neodoslané – chybné polia", invalid);
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

/**
 * XPath locator: the first visible <tag> following the caption whose OWN text
 * node starts with `label`. We match a direct text node (text()) rather than the
 * element's whole text content (.) so huge containers don't match, exclude the
 * header/footer, and skip hidden inputs — that last part fixes the bug where the
 * footer's hidden token input (value "74xXk2gx7tIr6jIx") was read as "Stav"/
 * "Telefón".
 */
function labelXpath(label: string, tag: string): string {
  const l = JSON.stringify(label); // safe double-quoted string for XPath
  const notHidden = tag === "input" ? "[not(@type='hidden')]" : "";
  return (
    `xpath=(//*[not(ancestor::header) and not(ancestor::footer)]` +
    `[starts-with(normalize-space(text()), ${l})])[last()]` +
    `/following::${tag}${notHidden}[1]`
  );
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

// Real Bazar.sk main-category ids (from data-cat-id on the add page). Used to
// click the exact tile instead of guessing by text.
const CATEGORY_IDS: Record<string, number> = {
  "Autá": 1,
  "Detské potreby": 14,
  "Elektro": 10,
  "Hudba": 7,
  "Knihy": 6,
  "Mobily": 11,
  "Motorky": 17,
  "Nábytok a bývanie": 13,
  "Oblečenie a obuv": 3,
  "Počítače": 18,
  "Práca": 4,
  "Reality": 2,
  "Služby": 12,
  "Starožitnosti a zberateľstvo": 639,
  "Stavba a záhrada": 16,
  "Stroje a náradie": 15,
  "Športové potreby": 5,
  "Zdravie a krása": 638,
  "Zvieratá": 8,
  "Ostatné": 9,
};

function bazarCategoryPath(
  category: string | null | undefined,
  title: string | null | undefined,
): { id: number; main: string; sub?: string } {
  const hay = `${category ?? ""} ${title ?? ""}`.toLowerCase();
  for (const r of CATEGORY_RULES) {
    if (r.re.test(hay)) {
      return { id: CATEGORY_IDS[r.main] ?? CATEGORY_IDS["Ostatné"], main: r.main, sub: r.sub };
    }
  }
  return { id: CATEGORY_IDS["Ostatné"], main: "Ostatné" };
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
          width: 1024,
          height: 1024,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 72 })
        .toBuffer();
    } catch {
      buffer = raw;
    }
    out.push({ name: `photo-${i}.jpg`, mimeType: "image/jpeg", buffer });
  }
  return out;
}
