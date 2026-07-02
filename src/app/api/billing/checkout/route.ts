import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { checkoutSchema } from "@/lib/validation";
import { stripe, TRIAL_DAYS, appBaseUrl } from "@/lib/stripe";
import { PLANS } from "@/lib/plans";

// POST /api/billing/checkout — start a Stripe Checkout session for a paid plan.
// Returns a URL the client redirects to. A 7-day trial is attached.
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const { plan, interval } = checkoutSchema.parse(await req.json());

  const priceId = PLANS[plan].prices[interval];
  if (!priceId) {
    throw new HttpError(
      400,
      "Cenník pre tento plán ešte nie je nastavený (chýba Stripe price ID).",
    );
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new HttpError(
      503,
      "Platby zatiaľ nie sú spustené (chýba STRIPE_SECRET_KEY).",
    );
  }

  // Ensure a subscription row exists (older accounts might not have one).
  const sub = await prisma.subscription.upsert({
    where: { userId: user.id },
    create: { userId: user.id, plan: "FREE", status: "ACTIVE" },
    update: {},
  });

  try {
    // Reuse or create the Stripe customer. preferred_locales="sk" makes Stripe
    // send invoices/receipts in Slovak.
    let customerId = sub.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
        preferred_locales: ["sk"],
      });
      customerId = customer.id;
      await prisma.subscription.update({
        where: { userId: user.id },
        data: { stripeCustomerId: customerId },
      });
    } else {
      // Ensure existing customers also get Slovak documents.
      await stripe.customers
        .update(customerId, { preferred_locales: ["sk"] })
        .catch(() => {});
    }

    const appUrl = appBaseUrl();
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      locale: "sk", // Slovak checkout page
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: TRIAL_DAYS },
      // Let businesses buy: collect the billing address and their VAT/tax ID so
      // Stripe issues a proper invoice for their accounting. When Stripe Tax is
      // enabled (STRIPE_TAX_ENABLED=true) and the EU VAT ID is valid, reverse
      // charge is applied automatically (invoice without VAT — "bez DPH").
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      automatic_tax: { enabled: process.env.STRIPE_TAX_ENABLED === "true" },
      success_url: `${appUrl}/dashboard?billing=success`,
      cancel_url: `${appUrl}/billing?billing=cancelled`,
      metadata: { userId: user.id, plan },
    });

    return json({ url: checkout.url });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Surface the real Stripe reason (invalid key, no such price, …) so it can
    // be fixed quickly instead of showing a generic 500.
    // eslint-disable-next-line no-console
    console.error("[checkout] Stripe error", err);
    throw new HttpError(
      502,
      `Platbu sa nepodarilo spustiť: ${(err as Error).message}`,
    );
  }
});
