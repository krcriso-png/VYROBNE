import type { Provider } from "./types";
import { BazosSkProvider } from "./bazos-sk";
import { BazosCzProvider } from "./bazos-cz";
import { BazarSkProvider } from "./bazar-sk";
import { MarketplaceProvider } from "./marketplace";
import { InzerProProvider } from "./inzerpro";
import { MockProvider } from "./mock";

// ===========================================================================
// Provider registry
//
// The single place where portal modules are wired in. Adding a portal is a
// one-line change here; the seed script reads this list to populate the
// Portal table, and the worker resolves providers by key at runtime.
// ===========================================================================

const providers: Provider[] = [
  new BazosSkProvider(),
  new BazosCzProvider(),
  new BazarSkProvider(),
  new MarketplaceProvider(),
  new InzerProProvider(),
  // Always-available test provider used by the demo seed & e2e flow.
  new MockProvider(),
];

const byKey = new Map<string, Provider>(providers.map((p) => [p.key, p]));

export function getProvider(key: string): Provider {
  const provider = byKey.get(key);
  if (!provider) {
    throw new Error(`Unknown provider: ${key}`);
  }
  return provider;
}

export function listProviders(): Provider[] {
  return [...providers];
}
