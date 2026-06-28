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
// Bazar.sk (browser automation) — reference scaffold
//
// Same pattern as Bazoš: Playwright-driven web flow. Selectors and the exact
// navigation must be verified against the live site before enabling. Kept as a
// documented skeleton so the registry/UI wiring is complete and the portal can
// be brought online by filling in the per-step bodies.
// ===========================================================================

const BASE_URL = "https://www.bazar.sk";

export class BazarSkProvider extends BrowserProvider {
  readonly key = "bazar-sk";
  readonly name = "Bazar.sk";
  readonly country = "SK";
  readonly supportsRefresh = false;

  async login(
    credentials: ProviderCredentials,
    ctx: ProviderContext,
  ): Promise<ProviderSession> {
    return this.withContext(null, ctx, async (context) => {
      const page = await context.newPage();
      await ctx.log(`Login ${this.name}`);
      await page.goto(`${BASE_URL}/prihlasenie`, {
        waitUntil: "domcontentloaded",
      });
      // TODO: fill login form using verified selectors.
      void credentials;
      return this.snapshot(context);
    });
  }

  async publish(
    listing: ListingPayload,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<PublishResult> {
    return this.withContext(session, ctx, async (context) => {
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/pridat-inzerat`, {
        waitUntil: "domcontentloaded",
      });
      await ctx.log("Filling listing form", { title: listing.title });
      // TODO: fill fields + upload images, then submit.
      const remoteUrl = page.url();
      return { remoteId: remoteUrl, remoteUrl };
    });
  }

  async delete(
    remoteId: string,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<void> {
    await this.withContext(session, ctx, async () => {
      await ctx.log("Delete listing", { remoteId });
      // TODO: implement deletion flow.
    });
  }

  async checkStatus(
    remoteId: string,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<StatusResult> {
    return this.withContext(session, ctx, async (context) => {
      const page = await context.newPage();
      const url = remoteId.startsWith("http") ? remoteId : `${BASE_URL}`;
      const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
      return { live: !!resp && resp.status() < 400, remoteUrl: url };
    });
  }
}
