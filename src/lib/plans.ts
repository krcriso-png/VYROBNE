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
  /** Monthly credit allowance; null = unlimited (PRO). */
  monthlyCredits: number | null;
  /** Display price in EUR per month (0 = free). */
  priceEur: number;
  /** Whether auto-renewal (bump) is available on this plan. */
  autoRenew: boolean;
  prices: {
    monthly?: string;
    yearly?: string;
  };
}

// Credit model: each publish/topovať costs 1 credit. Creating drafts and
// editing/deleting are free. The allowance resets monthly (PRO = unlimited).
export const PLANS: Record<Plan, PlanDefinition> = {
  FREE: {
    key: "FREE",
    name: "Free",
    maxActiveListings: null,
    monthlyCredits: 30,
    priceEur: 0,
    autoRenew: true,
    prices: {},
  },
  BASIC: {
    key: "BASIC",
    name: "Štart",
    maxActiveListings: null,
    monthlyCredits: 300,
    priceEur: 6.99,
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
    monthlyCredits: null, // unlimited (fair-use)
    priceEur: 12.99,
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
