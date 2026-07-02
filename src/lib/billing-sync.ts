import type Stripe from "stripe";
import type { SubscriptionStatus } from "@prisma/client";
import { prisma } from "./db";
import { stripe } from "./stripe";
import { planFromPriceId, PLANS } from "./plans";
import { OPERATOR } from "./legal";

/** Seller's legal details shown on every Stripe invoice (footer). */
function invoiceFooter(): string {
  const dph = OPERATOR.icDph ? ` · IČ DPH: ${OPERATOR.icDph}` : "";
  const dphNote = OPERATOR.icDph ? " Dodávateľ je platiteľom DPH." : "";
  return (
    `Dodávateľ: ${OPERATOR.legalName}, ${OPERATOR.address}. ` +
    `IČO: ${OPERATOR.ico} · DIČ: ${OPERATOR.dic}${dph}. ` +
    `${OPERATOR.registration}.${dphNote}`
  );
}

/**
 * Make the customer's documents Slovak and stamp our legal details onto their
 * invoices. Idempotent; safe to call on checkout and on billing view.
 */
export async function ensureCustomerBillingProfile(
  customerId: string,
): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  try {
    await stripe.customers.update(customerId, {
      preferred_locales: ["sk"],
      invoice_settings: { footer: invoiceFooter() },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[billing-sync] ensureCustomerBillingProfile failed", err);
  }
}

// ===========================================================================
// Stripe → DB subscription sync
//
// Shared by the webhook (real-time) and a "reconcile on view" safety net so the
// user's plan is correct even if a webhook was missed or misconfigured.
// ===========================================================================

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  unpaid: "PAST_DUE",
  incomplete: "INCOMPLETE",
  incomplete_expired: "CANCELED",
};

/** Write a Stripe subscription's state onto our matching Subscription row(s). */
export async function syncStripeSubscription(
  sub: Stripe.Subscription,
): Promise<void> {
  const priceId = sub.items.data[0]?.price.id;
  const plan = sub.status === "canceled" ? "FREE" : planFromPriceId(priceId);
  const status = STATUS_MAP[sub.status] ?? "INCOMPLETE";
  const allowance = PLANS[plan].monthlyCredits;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;

  const rows = await prisma.subscription.findMany({
    where: { stripeCustomerId: sub.customer as string },
    select: { userId: true, plan: true },
  });

  for (const row of rows) {
    const topUp = row.plan !== plan && allowance !== null;
    await prisma.subscription.update({
      where: { userId: row.userId },
      data: {
        plan,
        status,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
        ...(topUp ? { credits: allowance, creditsRenewAt: periodEnd } : {}),
      },
    });
    if (topUp) {
      await prisma.creditTransaction.create({
        data: { userId: row.userId, amount: allowance, reason: "monthly_grant" },
      });
    }
  }
}

export interface InvoiceRow {
  id: string;
  number: string;
  date: Date;
  amountEur: number;
  status: string;
  url: string | null;
}

/** List the user's Stripe invoices (newest first) for the billing history. */
export async function listUserInvoices(userId: string): Promise<InvoiceRow[]> {
  if (!process.env.STRIPE_SECRET_KEY) return [];
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub?.stripeCustomerId) return [];
  try {
    const inv = await stripe.invoices.list({
      customer: sub.stripeCustomerId,
      limit: 24,
    });
    return inv.data.map((i) => ({
      id: i.id ?? "",
      number: i.number ?? i.id ?? "",
      date: new Date(i.created * 1000),
      amountEur: (i.total ?? 0) / 100,
      status: i.status ?? "",
      url: i.hosted_invoice_url ?? i.invoice_pdf ?? null,
    }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[billing-sync] listUserInvoices failed", err);
    return [];
  }
}

/**
 * Pull the user's current subscription straight from Stripe and sync it. Used as
 * a self-healing fallback when a webhook was missed. Safe no-op when Stripe or
 * the customer isn't configured; never throws (errors are logged).
 */
export async function reconcileUserSubscription(userId: string): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub?.stripeCustomerId) return;
  try {
    // Keep the customer's language + invoice footer up to date (applies to the
    // next invoice, e.g. after the trial), then sync the subscription state.
    await ensureCustomerBillingProfile(sub.stripeCustomerId);
    const list = await stripe.subscriptions.list({
      customer: sub.stripeCustomerId,
      status: "all",
      limit: 1,
    });
    const latest = list.data[0];
    if (latest) await syncStripeSubscription(latest);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[billing-sync] reconcile failed", err);
  }
}
