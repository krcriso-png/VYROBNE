import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { planFromPriceId } from "@/lib/plans";
import type { SubscriptionStatus } from "@prisma/client";

// POST /api/webhooks/stripe — keep our Subscription rows in sync with Stripe.
// Verifies the signature, then handles the subscription lifecycle events
// (created/updated/deleted) that drive plan entitlements and the
// "subscription ending" notification.
export const POST = async (req: Request) => {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return new Response("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return new Response(
      `Webhook signature verification failed: ${(err as Error).message}`,
      { status: 400 },
    );
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(sub);
      break;
    }
    default:
      // Ignore unrelated events.
      break;
  }

  return new Response("ok", { status: 200 });
};

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  unpaid: "PAST_DUE",
  incomplete: "INCOMPLETE",
  incomplete_expired: "CANCELED",
};

async function syncSubscription(sub: Stripe.Subscription) {
  const priceId = sub.items.data[0]?.price.id;
  const plan = sub.status === "canceled" ? "FREE" : planFromPriceId(priceId);

  await prisma.subscription.updateMany({
    where: { stripeCustomerId: sub.customer as string },
    data: {
      plan,
      status: STATUS_MAP[sub.status] ?? "INCOMPLETE",
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    },
  });
}
