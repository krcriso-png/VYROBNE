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

// ===========================================================================
// InzerPro (HTTP API) — reference scaffold for the API integration style
//
// Demonstrates the *non-browser* path: a portal that exposes an HTTP API. The
// provider authenticates to obtain a token, then performs CRUD via fetch. This
// is cheaper and more reliable than browser automation and should be preferred
// whenever a portal offers an API.
//
// Endpoints below are illustrative; wire to the real API + auth scheme.
// ===========================================================================

const API_BASE = process.env.INZERPRO_API_BASE ?? "https://api.inzerpro.example";

interface InzerProSession {
  token: string;
}

export class InzerProProvider extends BaseProvider {
  readonly key = "inzerpro";
  readonly name = "InzerPro";
  readonly country = "SK";
  readonly integration: IntegrationType = "API";
  readonly supportsRefresh = true;

  async login(
    credentials: ProviderCredentials,
    ctx: ProviderContext,
  ): Promise<ProviderSession> {
    await ctx.log("Authenticating with InzerPro API");
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: credentials.login,
        password: credentials.password,
      }),
    });
    if (!res.ok) {
      throw new Error(`InzerPro login failed: ${res.status}`);
    }
    const data = (await res.json()) as { token: string; expiresIn?: number };
    const session: InzerProSession = { token: data.token };
    return {
      state: session,
      validUntil: data.expiresIn
        ? new Date(Date.now() + data.expiresIn * 1000)
        : undefined,
    };
  }

  private token(session: ProviderSession): string {
    return (session.state as InzerProSession).token;
  }

  async publish(
    listing: ListingPayload,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<PublishResult> {
    await ctx.log("Creating listing via API", { title: listing.title });
    const res = await fetch(`${API_BASE}/listings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token(session)}`,
      },
      body: JSON.stringify({
        title: listing.title,
        description: listing.description,
        price: listing.price,
        currency: listing.currency,
        category: listing.category,
        zip: listing.zip,
        phone: listing.phone,
        email: listing.email,
        images: listing.images.map((i) => i.url),
        attributes: listing.parameters,
      }),
    });
    if (!res.ok) throw new Error(`InzerPro publish failed: ${res.status}`);
    const data = (await res.json()) as { id: string; url: string };
    await ctx.log("Published", { remoteId: data.id });
    return { remoteId: data.id, remoteUrl: data.url };
  }

  async update(
    remoteId: string,
    listing: ListingPayload,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<PublishResult> {
    await ctx.log("Updating listing via API", { remoteId });
    const res = await fetch(`${API_BASE}/listings/${remoteId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token(session)}`,
      },
      body: JSON.stringify({
        title: listing.title,
        description: listing.description,
        price: listing.price,
        phone: listing.phone,
        images: listing.images.map((i) => i.url),
      }),
    });
    if (!res.ok) throw new Error(`InzerPro update failed: ${res.status}`);
    const data = (await res.json()) as { id: string; url: string };
    return { remoteId: data.id, remoteUrl: data.url };
  }

  async refresh(
    remoteId: string,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<void> {
    await ctx.log("Bumping listing via API", { remoteId });
    const res = await fetch(`${API_BASE}/listings/${remoteId}/bump`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token(session)}` },
    });
    if (!res.ok) throw new Error(`InzerPro refresh failed: ${res.status}`);
  }

  async delete(
    remoteId: string,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<void> {
    await ctx.log("Deleting listing via API", { remoteId });
    const res = await fetch(`${API_BASE}/listings/${remoteId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${this.token(session)}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`InzerPro delete failed: ${res.status}`);
    }
  }

  async checkStatus(
    remoteId: string,
    session: ProviderSession,
    _ctx: ProviderContext,
  ): Promise<StatusResult> {
    const res = await fetch(`${API_BASE}/listings/${remoteId}`, {
      headers: { authorization: `Bearer ${this.token(session)}` },
    });
    if (res.status === 404) return { live: false };
    const data = (await res.json()) as { url: string; active: boolean };
    return { live: data.active, remoteUrl: data.url };
  }
}
