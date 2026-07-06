import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import type {
  Provider,
  ProviderContext,
  ProviderCredentials,
  ProviderSession,
  ListingPayload,
  PublishResult,
  StatusResult,
} from "./types";
import type { IntegrationType } from "@prisma/client";
import { putObject } from "../lib/storage";

// ===========================================================================
// Base provider classes
//
// Concrete portals extend one of these to inherit sensible defaults and, for
// browser providers, lifecycle management of a Playwright context. The goal
// is that a new portal module only implements the portal-specific steps.
// ===========================================================================

// Ad / analytics / tracker hosts to block for every browser provider. These
// add nothing to automation but load heavy cross-origin iframes/scripts that
// OOM-crash the page in a memory-limited container and slow every step.
const BLOCKED_RESOURCE_RE =
  /doubleclick\.net|googlesyndication|googletagservices|googletagmanager|google-analytics|analytics\.google|pagead2|pubmatic\.com|gemius|azet\.sk\/livemonitor|tracker\.azet|adservice|adsystem|amazon-adsystem|criteo|rubiconproject|adnxs|casalemedia|smartadserver|scorecardresearch|outbrain|taboola|hotjar|cookielaw|onetrust|facebook\.net|connect\.facebook|\/ads\/|adsafeprotected|moatads|teads|yieldlab|quantserve/i;

// Portal-owned hosts whose requests must always go through (form/SMS AJAX,
// login, image uploads). These override the ad-block list above.
const FIRST_PARTY_RE =
  /(^|\/\/|\.)(bazar\.sk|azet\.sk|aimg\.sk|unitedclassifieds\.sk|bazos\.sk|bazos\.cz|sbazar\.cz)(\/|:|$)/i;

/** Default unsupported behaviour so partial providers still satisfy the type. */
export abstract class BaseProvider implements Provider {
  abstract readonly key: string;
  abstract readonly name: string;
  readonly country: string = "SK";
  abstract readonly integration: IntegrationType;
  readonly supportsRefresh: boolean = false;

  abstract login(
    credentials: ProviderCredentials,
    ctx: ProviderContext,
  ): Promise<ProviderSession>;

  abstract publish(
    listing: ListingPayload,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<PublishResult>;

  async update(
    _remoteId: string,
    listing: ListingPayload,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<PublishResult> {
    // Default strategy: many portals have no edit endpoint, so re-publish.
    await ctx.log("update() not specialised — falling back to re-publish");
    return this.publish(listing, session, ctx);
  }

  async refresh(
    _remoteId: string,
    _session: ProviderSession,
    _ctx: ProviderContext,
  ): Promise<void> {
    throw new Error(`${this.key} does not support refresh`);
  }

  abstract delete(
    remoteId: string,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<void>;

  abstract checkStatus(
    remoteId: string,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<StatusResult>;
}

/**
 * Base for Playwright-driven portals. Handles browser launch, restoring an
 * encrypted storageState, and tearing everything down. Subclasses implement
 * the per-portal steps and use `withContext` to get a ready browser context.
 */
export abstract class BrowserProvider extends BaseProvider {
  readonly integration: IntegrationType = "BROWSER";

  /**
   * Run `fn` with a Playwright context, restoring the provider session if
   * present. Guarantees the browser is always closed.
   */
  protected async withContext<T>(
    session: ProviderSession | null,
    ctx: ProviderContext,
    fn: (context: BrowserContext) => Promise<T>,
  ): Promise<T> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    try {
      browser = await chromium.launch({
        headless: ctx.headless,
        // Required to run Chromium as root inside a container, and to avoid
        // crashes from a small /dev/shm on hosts like Railway.
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          // Portals like bazar.sk embed many cross-origin ad/tracker iframes.
          // Under site isolation each becomes its own renderer process, which
          // OOM-crashes the page in a memory-limited container ("Page crashed"
          // during photo upload). Collapse them into fewer processes.
          "--disable-features=IsolateOrigins,site-per-process,TranslateUI",
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--disable-ipc-flooding-protection",
        ],
      });
      context = await browser.newContext({
        // Restore cookies/localStorage captured during login().
        storageState: (session?.state as never) ?? undefined,
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        locale: "sk-SK",
      });
      // Block ad/analytics/tracker requests. They add nothing to automation but
      // load heavy iframes/scripts that push a constrained container into OOM
      // and slow every step down. Never let a routing hiccup break the flow.
      await context
        .route("**/*", (route) => {
          const url = route.request().url();
          // NEVER block the portal's own requests (e.g. bazar.sk's SMS-code /
          // form AJAX). Only block clearly third-party ad/tracker hosts.
          if (!FIRST_PARTY_RE.test(url) && BLOCKED_RESOURCE_RE.test(url)) {
            route.abort().catch(() => route.continue().catch(() => {}));
          } else {
            route.continue().catch(() => {});
          }
        })
        .catch(() => {});
      // Our bundler keeps function names via an esbuild `__name` helper. When a
      // page.evaluate/$$eval callback is serialised and run in the browser, that
      // `__name` reference isn't defined there and throws
      // "ReferenceError: __name is not defined". Define a no-op shim on every
      // document (survives navigations) so all in-page callbacks work. Passed as
      // a STRING so the bundler can't rewrite the shim into a self-reference.
      await context.addInitScript(
        "window.__name = window.__name || function (t) { return t; };",
      );
      return await fn(context);
    } catch (err) {
      // Capture what the page looked like so selectors/flows can be debugged
      // without access to the live portal. Never let capture mask the error.
      await this.captureDebug(context, ctx).catch(() => undefined);
      throw err;
    } finally {
      await browser?.close();
    }
  }

  /** Save a screenshot of each open page to storage and log where it landed. */
  private async captureDebug(
    context: BrowserContext | null,
    ctx: ProviderContext,
  ): Promise<void> {
    if (!context) return;
    for (const page of context.pages()) {
      try {
        const buf = await page.screenshot({ fullPage: true });
        const key = `debug/${this.key}-${Date.now()}.png`;
        await putObject(key, buf, "image/png");
        await ctx.log(
          `Snímka pri chybe uložená: /api/blob/${key} · stránka: ${page.url()} · titulok: "${await page.title()}"`,
          { debugScreenshot: `/api/blob/${key}`, url: page.url() },
        );
      } catch {
        // ignore capture failures
      }
    }
  }

  /** Serialise the current context into a persistable session blob. */
  protected async snapshot(context: BrowserContext): Promise<ProviderSession> {
    const state = await context.storageState();
    // Always carry a validity window. Without it, persistSessionRefresh() would
    // store sessionValidUntil = null after a publish, the session would count as
    // expired, and the next post would log in from scratch — throwing away the
    // SMS-verified cookies and making the portal ask for a NEW code every time.
    return {
      state,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
  }

  /** Dismiss a cookie-consent banner if present (best-effort, never throws). */
  protected async acceptCookies(
    page: Page,
    ctx: ProviderContext,
    labels: string[] = [
      // Slovak (bazos.sk)
      "Súhlasím",
      "Súhlasím so všetkým",
      "Prijať všetko",
      "Rozumiem",
      // Czech (bazos.cz)
      "Souhlasím",
      "Souhlasím se vším",
      "Přijmout vše",
      "Rozumím",
      // English fallback
      "Accept all",
    ],
  ): Promise<void> {
    for (const label of labels) {
      try {
        const btn = page.getByText(label, { exact: false }).first();
        if (await btn.isVisible({ timeout: 1500 })) {
          await btn.click({ timeout: 2000 });
          await ctx.log(`Cookie lišta: kliknuté "${label}"`);
          await page.waitForTimeout(400);
          return;
        }
      } catch {
        // try the next label
      }
    }
  }

  /** Capture a labelled screenshot to storage and log its /api/blob path. */
  protected async debugShot(
    page: Page,
    ctx: ProviderContext,
    label: string,
  ): Promise<void> {
    try {
      const buf = await page.screenshot({ fullPage: true });
      const key = `debug/${this.key}-${label}-${Date.now()}.png`;
      await putObject(key, buf, "image/png");
      await ctx.log(`📸 [${label}] /api/blob/${key} · ${page.url()}`);
    } catch {
      // ignore
    }
  }

  /**
   * Log the page's links and form fields as text (visible in Railway logs).
   * Used to map a portal's real DOM structure when the live site can't be
   * inspected directly.
   */
  protected async logStructure(
    page: Page,
    ctx: ProviderContext,
  ): Promise<void> {
    try {
      const links = await page.$$eval("a", (as) =>
        as
          .map((a) => `${(a.textContent ?? "").trim()} => ${a.getAttribute("href")}`)
          .filter((s) => s && !s.startsWith(" =>"))
          .slice(0, 300),
      );
      await ctx.log(`ODKAZY(${links.length}): ${links.join(" | ")}`);

      const fields = await page.$$eval("input,select,textarea", (els) =>
        els.map((e) => {
          const name = e.getAttribute("name") ?? e.getAttribute("id") ?? "";
          const type = e.getAttribute("type") ?? e.tagName.toLowerCase();
          const opts =
            e.tagName === "SELECT"
              ? "[" +
                Array.from((e as HTMLSelectElement).options)
                  .slice(0, 40)
                  .map((o) => `${o.value}:${o.textContent?.trim()}`)
                  .join(",") +
                "]"
              : "";
          return `${e.tagName}:${name}:${type}${opts}`;
        }),
      );
      await ctx.log(`POLIA(${fields.length}): ${fields.join(" | ")}`);
    } catch (e) {
      await ctx.log("logStructure zlyhalo: " + String(e));
    }
  }
}
