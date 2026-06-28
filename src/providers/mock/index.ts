import { BaseProvider } from "../base";
import type {
  ProviderContext,
  ProviderCredentials,
  ProviderSession,
  ListingPayload,
  PublishResult,
  StatusResult,
} from "../types";
import type { IntegrationType } from "@prisma/client";
import { randomUUID } from "node:crypto";

// ===========================================================================
// Mock provider
//
// A fully working, dependency-free provider used for the demo seed, local
// development and end-to-end tests. It simulates latency and occasionally a
// transient failure so the retry/backoff path is exercised. No real network.
// ===========================================================================

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class MockProvider extends BaseProvider {
  readonly key = "mock";
  readonly name = "Demo Portal (Mock)";
  readonly country = "SK";
  readonly integration: IntegrationType = "API";
  readonly supportsRefresh = true;

  async login(
    credentials: ProviderCredentials,
    ctx: ProviderContext,
  ): Promise<ProviderSession> {
    await ctx.log(`Login as ${credentials.login ?? "anonymous"}`);
    await sleep(150);
    return {
      state: { token: randomUUID(), login: credentials.login },
      validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24),
    };
  }

  async publish(
    listing: ListingPayload,
    _session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<PublishResult> {
    await ctx.log("Upload fotiek", { count: listing.images.length });
    await sleep(200);
    const remoteId = `mock-${randomUUID().slice(0, 8)}`;
    await ctx.log("Published", { remoteId });
    return {
      remoteId,
      remoteUrl: `https://demo.example/inzerat/${remoteId}`,
    };
  }

  async refresh(
    remoteId: string,
    _session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<void> {
    await ctx.log("Bumped listing to top", { remoteId });
    await sleep(80);
  }

  async delete(
    remoteId: string,
    _session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<void> {
    await ctx.log("Deleted listing", { remoteId });
    await sleep(80);
  }

  async checkStatus(
    remoteId: string,
    _session: ProviderSession,
    _ctx: ProviderContext,
  ): Promise<StatusResult> {
    return {
      live: true,
      remoteUrl: `https://demo.example/inzerat/${remoteId}`,
      detail: "OK",
    };
  }
}
