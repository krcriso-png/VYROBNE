import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { stripe, appBaseUrl } from "@/lib/stripe";

// POST /api/billing/portal — open the Stripe customer portal so the user can
// update their card, view invoices or cancel the subscription. Returns a URL
// the client redirects to.
export const POST = route(async () => {
  const user = await requireUser();
  const sub = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });
  if (!sub?.stripeCustomerId) {
    throw new HttpError(400, "Nemáš žiadne platené predplatné na správu.");
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${appBaseUrl()}/billing`,
  });

  return json({ url: portal.url });
});
