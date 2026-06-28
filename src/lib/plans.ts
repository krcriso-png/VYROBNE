import type { Plan } from "@prisma/client";

// ===========================================================================
// Subscription plans & entitlements
//
// A single source of truth for what each plan allows. The Stripe price IDs are
// pulled from the environment so the same code works across test/live modes.
// ===========================================================================

export interface PlanDefinition {
  key: Plan;
  name: string;
  /** Maximum number of ACTIVE listings; null = unlimited. */
  maxActiveListings: number | null;
  /** Whether auto-renewal (bump) is available on this plan. */
  autoRenew: boolean;
  prices: {
    monthly?: string;
    yearly?: string;
  };
}

export const PLANS: Record<Plan, PlanDefinition> = {
  FREE: {
    key: "FREE",
    name: "Free",
    maxActiveListings: 3,
    autoRenew: false,
    prices: {},
  },
  BASIC: {
    key: "BASIC",
    name: "Basic",
    maxActiveListings: 30,
    autoRenew: true,
    prices: {
      monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY,
      yearly: process.env.STRIPE_PRICE_BASIC_YEARLY,
    },
  },
  PRO: {
    key: "PRO",
    name: "Pro",
    maxActiveListings: null, // unlimited
    autoRenew: true,
    prices: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
      yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
    },
  },
};

export function planFor(plan: Plan): PlanDefinition {
  return PLANS[plan];
}

/** Returns true when a user on `plan` may have one more active listing. */
export function canAddActiveListing(plan: Plan, currentActive: number): boolean {
  const max = PLANS[plan].maxActiveListings;
  return max === null || currentActive < max;
}

/** Map a Stripe price ID back to a plan, for webhook handling. */
export function planFromPriceId(priceId: string | null | undefined): Plan {
  if (!priceId) return "FREE";
  for (const def of Object.values(PLANS)) {
    if (def.prices.monthly === priceId || def.prices.yearly === priceId) {
      return def.key;
    }
  }
  return "FREE";
}
