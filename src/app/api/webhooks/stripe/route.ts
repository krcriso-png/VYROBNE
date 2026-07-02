import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { syncStripeSubscription } from "@/lib/billing-sync";

// POST /api/webhooks/stripe — keep our Subscription rows in sync with Stripe.
// Verifies the signature, then handles the subscription lifecycle events
// (created/updated/deleted) that drive plan entitlements.
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
    // eslint-disable-next-line no-console
    console.error(
      `[stripe-webhook] signature verification FAILED: ${(err as Error).message}`,
    );
    return new Response(
      `Webhook signature verification failed: ${(err as Error).message}`,
      { status: 400 },
    );
  }

  // eslint-disable-next-line no-console
  console.log(`[stripe-webhook] received ${event.type}`);

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncStripeSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "checkout.session.completed": {
        // Belt-and-braces: right after payment, fetch the subscription and sync
        // it — so the plan activates even if the subscription.* event is delayed.
        const cs = event.data.object as Stripe.Checkout.Session;
        if (cs.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            cs.subscription as string,
          );
          await syncStripeSubscription(sub);
        }
        break;
      }
      default:
        // Ignore unrelated events.
        break;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[stripe-webhook] handler error for ${event.type}:`, err);
    // Return 200 anyway so Stripe doesn't hammer retries for a transient issue;
    // the log above captures what went wrong.
    return new Response("handler-error", { status: 200 });
  }

  return new Response("ok", { status: 200 });
};
