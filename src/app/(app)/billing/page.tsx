import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { UpgradeButtons } from "@/components/UpgradeButtons";

// Billing overview: current plan + upgrade via Stripe Checkout.
export default async function BillingPage() {
  const session = await auth();
  const sub = await prisma.subscription.findUnique({
    where: { userId: session!.user.id },
  });
  const plan = sub?.plan ?? "FREE";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Predplatné</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Aktuálny plán: <strong>{PLANS[plan].name}</strong> · stav:{" "}
        {sub?.status ?? "ACTIVE"}
        {sub?.currentPeriodEnd
          ? ` · obnova ${sub.currentPeriodEnd.toLocaleDateString("sk-SK")}`
          : ""}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {Object.values(PLANS).map((p) => (
          <div
            key={p.key}
            className={`rounded-xl border bg-card p-6 ${
              p.key === plan ? "ring-2 ring-primary" : ""
            }`}
          >
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {p.maxActiveListings === null
                ? "Neobmedzené inzeráty"
                : `${p.maxActiveListings} aktívnych inzerátov`}
            </p>
            <div className="mt-4">
              {p.key === "FREE" || p.key === plan ? (
                <span className="text-sm text-muted-foreground">
                  {p.key === plan ? "Aktívny plán" : "Zadarmo"}
                </span>
              ) : (
                <UpgradeButtons plan={p.key as "BASIC" | "PRO"} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
