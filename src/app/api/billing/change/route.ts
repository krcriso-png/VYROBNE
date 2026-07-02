import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { checkoutSchema } from "@/lib/validation";
import { stripe } from "@/lib/stripe";
import { PLANS } from "@/lib/plans";
import { syncStripeSubscription } from "@/lib/billing-sync";

// POST /api/billing/change — switch an EXISTING subscription to another paid
// plan/interval (up- or downgrade) by updating its price, with proration. This
// avoids creating a second subscription (which a fresh Checkout would do).
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const { plan, interval } = checkoutSchema.parse(await req.json());

  const priceId = PLANS[plan].prices[interval];
  if (!priceId) {
    throw new HttpError(400, "Cenník pre tento plán nie je nastavený.");
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });
  let subId = sub?.stripeSubscriptionId ?? undefined;
  if (!subId && sub?.stripeCustomerId) {
    const list = await stripe.subscriptions.list({
      customer: sub.stripeCustomerId,
      status: "all",
      limit: 1,
    });
    subId = list.data[0]?.id;
  }
  if (!subId) {
    throw new HttpError(400, "Nemáš aktívne predplatné na zmenu.");
  }

  const current = await stripe.subscriptions.retrieve(subId);
  const itemId = current.items.data[0]?.id;
  if (!itemId) throw new HttpError(400, "Predplatné sa nepodarilo načítať.");

  const updated = await stripe.subscriptions.update(subId, {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: "create_prorations",
    cancel_at_period_end: false,
  });
  await syncStripeSubscription(updated);

  return json({ ok: true });
});
