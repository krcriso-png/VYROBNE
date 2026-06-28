import { chromium, type Browser, type BrowserContext } from "playwright";
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
        ],
      });
      context = await browser.newContext({
        // Restore cookies/localStorage captured during login().
        storageState: (session?.state as never) ?? undefined,
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        locale: "sk-SK",
      });
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
    return { state };
  }
}
