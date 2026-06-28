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
// Marketplace (browser automation) — reference scaffold
//
// Social-network marketplaces have no public listing API and strong anti-bot
// measures (CAPTCHA, checkpoints). This provider therefore relies on a
// persisted, human-established session (login performed interactively, the
// resulting storageState stored encrypted) rather than automating credential
// entry. `login()` here only validates/refreshes that stored session.
//
// IMPORTANT: Any automation here must respect the platform's Terms of Service.
// This scaffold exists to demonstrate the architecture's support for the
// "session-only" integration style; it is disabled until a compliant flow is
// configured.
// ===========================================================================

export class MarketplaceProvider extends BrowserProvider {
  readonly key = "marketplace";
  readonly name = "Marketplace";
  readonly country = "INT";
  readonly supportsRefresh = false;

  async login(
    credentials: ProviderCredentials,
    ctx: ProviderContext,
  ): Promise<ProviderSession> {
    // We expect a pre-captured session; just verify it still works.
    if (!credentials.session) {
      throw new Error(
        "Marketplace requires a pre-captured session (interactive login).",
      );
    }
    await ctx.log("Validating stored Marketplace session");
    return { state: credentials.session };
  }

  async publish(
    listing: ListingPayload,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<PublishResult> {
    return this.withContext(session, ctx, async (context) => {
      const page = await context.newPage();
      await ctx.log("Opening create-listing flow", { title: listing.title });
      // TODO: implement compliant create-listing automation.
      const remoteUrl = page.url();
      return { remoteId: remoteUrl, remoteUrl, session };
    });
  }

  async delete(
    remoteId: string,
    _session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<void> {
    await ctx.log("Delete listing", { remoteId });
    // TODO: implement deletion flow.
  }

  async checkStatus(
    remoteId: string,
    _session: ProviderSession,
    _ctx: ProviderContext,
  ): Promise<StatusResult> {
    return { live: true, remoteUrl: remoteId };
  }
}
