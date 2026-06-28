import { Check } from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { UpgradeButtons } from "@/components/UpgradeButtons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PLAN_FEATURES: Record<string, string[]> = {
  FREE: ["3 aktívne inzeráty", "Všetky portály", "Manuálne publikovanie"],
  BASIC: ["30 aktívnych inzerátov", "Automatická obnova", "Synchronizácia zmien"],
  PRO: ["Neobmedzene inzerátov", "Prioritné spracovanie", "Všetky funkcie"],
};

// Billing overview: current plan + upgrade via Stripe Checkout.
export default async function BillingPage() {
  const session = await auth();
  const sub = await prisma.subscription.findUnique({
    where: { userId: session!.user.id },
  });
  const plan = sub?.plan ?? "FREE";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Predplatné</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aktuálny plán: <strong>{PLANS[plan].name}</strong> · stav{" "}
          {sub?.status ?? "ACTIVE"}
          {sub?.currentPeriodEnd
            ? ` · obnova ${sub.currentPeriodEnd.toLocaleDateString("sk-SK")}`
            : ""}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {Object.values(PLANS).map((p) => {
          const current = p.key === plan;
          return (
            <Card
              key={p.key}
              className={"relative p-6 " + (current ? "ring-2 ring-primary" : "")}
            >
              {current && (
                <Badge tone="primary" className="absolute -top-3 left-6">
                  Aktívny plán
                </Badge>
              )}
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {p.maxActiveListings === null
                  ? "Neobmedzené inzeráty"
                  : `${p.maxActiveListings} aktívnych inzerátov`}
              </p>
              <ul className="mt-4 space-y-2">
                {(PLAN_FEATURES[p.key] ?? []).map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="size-4 text-success" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {p.key === "FREE" || current ? (
                  <span className="text-sm text-muted-foreground">
                    {current ? "Práve používaš" : "Zadarmo"}
                  </span>
                ) : (
                  <UpgradeButtons plan={p.key as "BASIC" | "PRO"} />
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
