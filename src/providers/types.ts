import type { IntegrationType } from "@prisma/client";

// ===========================================================================
// Provider plugin contract
//
// Every supported portal is a self-contained module implementing this same
// interface. New portals can be added without touching the rest of the system
// — register the module and it becomes available end-to-end (UI checkbox,
// queue, sync). Integrations come in two flavours:
//
//   API     — talk to an official / unofficial HTTP endpoint
//   BROWSER — drive a real browser with Playwright (for portals with no API)
//
// Both implement the identical verbs below, so callers never care which one
// they are using.
// ===========================================================================

/** Normalised listing payload handed to a provider, decoupled from Prisma. */
export interface ListingPayload {
  id: string;
  title: string;
  description: string;
  price: number | null;
  currency: string;
  category: string;
  parameters: Record<string, unknown>;
  tags: string[];
  location: string | null;
  zip: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  web: string | null;
  images: ProviderImage[];
}

export interface ProviderImage {
  /** Time-limited URL the provider can download the bytes from. */
  url: string;
  position: number;
  isMain: boolean;
}

/** Decrypted portal credentials + any restorable session, supplied by core. */
export interface ProviderCredentials {
  login: string | null;
  password: string | null;
  /** Playwright storageState or provider session blob, already decrypted. */
  session: unknown | null;
}

/** A live, possibly-authenticated session a provider returns from login(). */
export interface ProviderSession {
  /** Opaque blob to persist (encrypted) and pass back on the next call. */
  state: unknown;
  /** Optional absolute expiry; core marks the account for re-auth after this. */
  validUntil?: Date;
}

export interface PublishResult {
  remoteId: string;
  remoteUrl: string;
  /** Updated session to persist, if the provider refreshed it. */
  session?: ProviderSession;
}

export interface StatusResult {
  /** Whether the listing is still live on the portal. */
  live: boolean;
  /**
   * Whether the provider could actually determine liveness. When false (e.g.
   * not logged in, couldn't load the ad list), the caller must NOT change the
   * stored status — only a confident result may flip a listing to REMOVED.
   * Treated as true when omitted.
   */
  verified?: boolean;
  /** The real ad id, if the provider re-resolved it (e.g. after a re-post). */
  remoteId?: string;
  remoteUrl?: string;
  /** Current view count scraped from the ad page, if available. */
  views?: number;
  /** Free-form details surfaced in the UI. */
  detail?: string;
}

/** Context passed to every provider call: scoped logger + cancellation. */
export interface ProviderContext {
  log: (message: string, meta?: Record<string, unknown>) => Promise<void>;
  signal?: AbortSignal;
  headless: boolean;
  /**
   * Pause and ask the user for a value (e.g. an SMS/verification code). The
   * worker sets the publication to WAITING_SMS and resolves when the user
   * submits it, or null on timeout. Undefined when not running under a worker.
   */
  requestUserInput?: (prompt: string) => Promise<string | null>;
  /** The listing's title — lets status checks find the ad by name in the
   * portal's "my ads" list. */
  listingTitle?: string;
  /** The listing's contact e-mail — Bazoš "Moje inzeráty" is opened with the
   * ad's e-mail + per-ad password (no account needed). */
  listingEmail?: string;
  /** Decrypted portal credentials (e.g. the per-ad password) for form fields. */
  secrets?: {
    login: string | null;
    password: string | null;
    /** Phone for SMS verification (overrides the listing phone). */
    verifyPhone?: string | null;
  };
  /**
   * Persist the current session immediately (e.g. right after a phone
   * verification) so it survives even if a later step fails and future runs
   * can skip the verification. Implemented by the worker.
   */
  saveSession?: (session: ProviderSession) => Promise<void>;
}

/**
 * The interface every portal module implements. Methods should throw on
 * failure; the worker translates thrown errors into retries + error logs.
 */
export interface Provider {
  /** Stable key, e.g. "bazos-sk". Must match the seeded Portal.key. */
  readonly key: string;
  readonly name: string;
  readonly country: string;
  readonly integration: IntegrationType;
  readonly supportsRefresh: boolean;
  /**
   * How a "bump/refresh" is performed:
   *  - "native": call refresh() (a real top/bump action on the portal)
   *  - "repost": delete the ad and publish it again (gets a fresh date)
   */
  readonly refreshStrategy?: "native" | "repost";

  /** Establish/validate a session from credentials. */
  login(
    credentials: ProviderCredentials,
    ctx: ProviderContext,
  ): Promise<ProviderSession>;

  /** Create a new listing on the portal. */
  publish(
    listing: ListingPayload,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<PublishResult>;

  /** Update an existing listing identified by remoteId. */
  update(
    remoteId: string,
    listing: ListingPayload,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<PublishResult>;

  /** Bump/refresh a listing to the top, if the portal supports it. */
  refresh(
    remoteId: string,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<void>;

  /** Remove a listing from the portal. */
  delete(
    remoteId: string,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<void>;

  /** Check whether a listing is still live. */
  checkStatus(
    remoteId: string,
    session: ProviderSession,
    ctx: ProviderContext,
  ): Promise<StatusResult>;
}
