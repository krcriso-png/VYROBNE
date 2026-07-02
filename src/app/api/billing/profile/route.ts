import { prisma } from "@/lib/db";
import { route, json, requireUser } from "@/lib/api";
import { billingProfileSchema } from "@/lib/validation";
import { ensureCustomerBillingProfile } from "@/lib/billing-sync";

const FIELDS = [
  "billingName",
  "billingIco",
  "billingDic",
  "billingVatId",
  "billingStreet",
  "billingCity",
  "billingZip",
  "billingCountry",
] as const;

// GET /api/billing/profile — the user's saved company/billing details.
export const GET = route(async () => {
  const user = await requireUser();
  const sub = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });
  const out: Record<string, string | null> = {};
  for (const f of FIELDS) out[f] = (sub?.[f] as string | null) ?? null;
  return json(out);
});

// PATCH /api/billing/profile — save company/billing details. Pushes them onto
// the Stripe customer (name, address, IČO/DIČ, IČ DPH) so invoices are correct.
export const PATCH = route(async (req: Request) => {
  const user = await requireUser();
  const data = billingProfileSchema.parse(await req.json());

  const clean: Record<string, string | null> = {};
  for (const f of FIELDS) {
    if (f in data) {
      const v = (data as Record<string, string | null | undefined>)[f];
      clean[f] = v ? String(v).trim() : null;
    }
  }

  const sub = await prisma.subscription.upsert({
    where: { userId: user.id },
    create: { userId: user.id, plan: "FREE", status: "ACTIVE", ...clean },
    update: clean,
  });

  if (sub.stripeCustomerId) {
    await ensureCustomerBillingProfile(sub.stripeCustomerId);
  }

  return json({ ok: true });
});
