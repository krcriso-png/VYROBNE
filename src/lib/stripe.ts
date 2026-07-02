import Stripe from "stripe";

// ===========================================================================
// Stripe client
//
// Used for subscription checkout, the customer portal (cancel / update card),
// and webhook-driven sync of subscription state into our DB. Trials and
// automatic renewal are configured at the Price/Checkout level.
// ===========================================================================

const globalForStripe = globalThis as unknown as { stripe?: Stripe };

export const stripe: Stripe =
  globalForStripe.stripe ??
  new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalForStripe.stripe = stripe;
}

export const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS ?? 7);

/** Public base URL for Stripe success/cancel/return links (no trailing slash). */
export function appBaseUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.AUTH_URL ??
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : "http://localhost:3000")
  ).replace(/\/$/, "");
}
