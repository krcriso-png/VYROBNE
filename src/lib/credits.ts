import type { Plan } from "@prisma/client";
import { prisma } from "./db";
import { PLANS } from "./plans";

// ===========================================================================
// Credit wallet
//
// Each publish and each topovať (bump) costs one credit. Drafts, edits and
// deletes are free. Every plan has a monthly allowance that resets on
// `creditsRenewAt`; PRO is unlimited (never decremented). The append-only
// CreditTransaction table is the history shown to the user.
// ===========================================================================

export const CREDIT_COST = {
  publish: 1,
  topovat: 1,
} as const;

export interface CreditState {
  plan: Plan;
  credits: number;
  unlimited: boolean;
  renewAt: Date | null;
  monthlyAllowance: number | null;
}

function addMonth(from: Date): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d;
}

/**
 * Ensure the user's monthly allowance is applied: if the renewal date has
 * passed (or was never set), reset the balance to the plan allowance and
 * schedule the next reset. No-op for unlimited (PRO) plans.
 */
export async function ensureMonthlyGrant(userId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) return;
  const allowance = PLANS[sub.plan].monthlyCredits;
  if (allowance === null) return; // unlimited — nothing to reset

  const now = new Date();
  if (!sub.creditsRenewAt || sub.creditsRenewAt <= now) {
    await prisma.subscription.update({
      where: { userId },
      data: { credits: allowance, creditsRenewAt: addMonth(now) },
    });
    await prisma.creditTransaction.create({
      data: { userId, amount: allowance, reason: "monthly_grant" },
    });
  }
}

/** Current credit state (after applying any due monthly reset). */
export async function getCreditState(userId: string): Promise<CreditState> {
  await ensureMonthlyGrant(userId);
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const plan = sub?.plan ?? "FREE";
  const allowance = PLANS[plan].monthlyCredits;
  return {
    plan,
    credits: sub?.credits ?? 0,
    unlimited: allowance === null,
    renewAt: sub?.creditsRenewAt ?? null,
    monthlyAllowance: allowance,
  };
}

/** Whether the user can afford `amount` credits (always true when unlimited). */
export async function hasCredits(
  userId: string,
  amount: number,
): Promise<boolean> {
  const state = await getCreditState(userId);
  return state.unlimited || state.credits >= amount;
}

export class InsufficientCreditsError extends Error {
  constructor() {
    super("INSUFFICIENT_CREDITS");
    this.name = "InsufficientCreditsError";
  }
}

/**
 * Spend `amount` credits atomically, recording the movement. Throws
 * InsufficientCreditsError when the balance is too low. Unlimited plans record
 * the usage for history but are never decremented.
 */
export async function spendCredits(
  userId: string,
  amount: number,
  reason: string,
  listingId?: string | null,
): Promise<void> {
  await ensureMonthlyGrant(userId);
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const unlimited = sub ? PLANS[sub.plan].monthlyCredits === null : false;

  if (!unlimited) {
    const res = await prisma.subscription.updateMany({
      where: { userId, credits: { gte: amount } },
      data: { credits: { decrement: amount } },
    });
    if (res.count === 0) throw new InsufficientCreditsError();
  }

  await prisma.creditTransaction.create({
    data: { userId, amount: -amount, reason, listingId: listingId ?? null },
  });
}

/** Grant credits (admin top-up, signup bonus, refund). */
export async function grantCredits(
  userId: string,
  amount: number,
  reason: string,
): Promise<void> {
  await prisma.subscription.update({
    where: { userId },
    data: { credits: { increment: amount } },
  });
  await prisma.creditTransaction.create({
    data: { userId, amount, reason },
  });
}

const REASON_LABEL: Record<string, string> = {
  publish: "Zverejnenie inzerátu",
  topovat: "Topovanie",
  monthly_grant: "Mesačný kredit",
  signup: "Bonus za registráciu",
  admin: "Úprava adminom",
};

export function creditReasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}
