import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { stripe } from "@/lib/stripe";
import { syncStripeSubscription } from "@/lib/billing-sync";

// POST /api/billing/cancel — cancel (at period end) or resume the current
// subscription directly, without sending the user to the Stripe portal.
// Body: { cancel: boolean } — true = cancel at period end, false = resume.
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const { cancel = true } = (await req.json().catch(() => ({}))) as {
    cancel?: boolean;
  };

  const sub = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });
  if (!sub?.stripeCustomerId) {
    throw new HttpError(400, "Nemáš žiadne aktívne predplatné.");
  }

  // Find the Stripe subscription id (fall back to looking it up by customer).
  let subId = sub.stripeSubscriptionId ?? undefined;
  if (!subId) {
    const list = await stripe.subscriptions.list({
      customer: sub.stripeCustomerId,
      status: "all",
      limit: 1,
    });
    subId = list.data[0]?.id;
  }
  if (!subId) {
    throw new HttpError(400, "Nenašlo sa predplatné na zrušenie.");
  }

  const updated = await stripe.subscriptions.update(subId, {
    cancel_at_period_end: cancel,
  });
  await syncStripeSubscription(updated);

  return json({ ok: true, cancelAtPeriodEnd: updated.cancel_at_period_end });
});
