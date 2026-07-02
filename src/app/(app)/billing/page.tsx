import { Check, Coins } from "lucide-react";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PLANS, yearlySavingPct, yearlyPerMonthEur, eur } from "@/lib/plans";
import { getCreditState, creditReasonLabel } from "@/lib/credits";
import { reconcileUserSubscription, listUserInvoices } from "@/lib/billing-sync";

// Stripe invoice status → Slovak label.
const INVOICE_STATUS: Record<string, string> = {
  paid: "Zaplatená",
  open: "Neuhradená",
  draft: "Koncept",
  void: "Zrušená",
  uncollectible: "Nevymožiteľná",
};
import { UpgradeButtons } from "@/components/UpgradeButtons";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import {
  DowngradeToFree,
  ResumeSubscription,
} from "@/components/SubscriptionActions";
import { Card } from "@/components/ui/card";

function planFeatures(key: string): string[] {
  const p = PLANS[key as keyof typeof PLANS];
  const credits =
    p.monthlyCredits === null
      ? "Neobmedzene kreditov*"
      : `${p.monthlyCredits} kreditov / mesiac`;
  return [
    credits,
    "1 kredit = pridanie alebo topovanie",
    "Všetky portály",
    "Automatické topovanie",
    key === "PRO" ? "Prioritné spracovanie" : "Synchronizácia zmien",
  ];
}

// Billing: credit balance + plans (credit allowances) + history.
export default async function BillingPage() {
  const session = await auth();
  const userId = session!.user.id;

  // Self-heal: pull the current subscription state from Stripe on view, so the
  // plan is correct even if a webhook was missed/misconfigured.
  await reconcileUserSubscription(userId);

  const [sub, credit, history, invoices] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId } }),
    getCreditState(userId),
    prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    listUserInvoices(userId),
  ]);
  const plan = sub?.plan ?? "FREE";
  const hasPaidSub =
    !!sub?.stripeCustomerId &&
    plan !== "FREE" &&
    ["ACTIVE", "TRIALING", "PAST_DUE"].includes(sub?.status ?? "");
  const endsAt =
    sub?.currentPeriodEnd?.toLocaleDateString("sk-SK") ??
    sub?.trialEndsAt?.toLocaleDateString("sk-SK") ??
    null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Predplatné a kredity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aktuálny plán: <strong>{PLANS[plan].name}</strong>
          {sub?.status ? ` · stav ${sub.status}` : ""}
        </p>
        {hasPaidSub && sub?.cancelAtPeriodEnd && (
          <p className="mt-2 text-sm font-medium text-warning">
            ⚠️ Predplatné sa zruší{endsAt ? ` ${endsAt}` : ""} a prepne na Free.
            Obnoviť ho môžeš v karte plánu nižšie.
          </p>
        )}
      </div>

      {/* Credit balance */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-4">
          <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
            <Coins className="size-6" />
          </div>
          <div>
            <p className="text-3xl font-bold tabular-nums">
              {credit.unlimited ? "Neobmedzene" : credit.credits}
            </p>
            <p className="text-sm text-muted-foreground">
              {credit.unlimited
                ? "kreditov (Pro plán)"
                : `kreditov ostáva${
                    credit.monthlyAllowance
                      ? ` z ${credit.monthlyAllowance}`
                      : ""
                  }`}
            </p>
          </div>
        </div>
        {!credit.unlimited && credit.renewAt && (
          <div className="text-right text-sm text-muted-foreground">
            <p>Obnova kreditov</p>
            <p className="font-medium text-foreground">
              {credit.renewAt.toLocaleDateString("sk-SK")}
            </p>
          </div>
        )}
      </Card>

      {/* Plans */}
      <div className="grid gap-6 sm:grid-cols-3">
        {Object.values(PLANS).map((p) => {
          const current = p.key === plan;
          return (
            <Card
              key={p.key}
              className={"relative p-6 " + (current ? "ring-2 ring-primary" : "")}
            >
              {current && (
                <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground shadow-sm">
                  Aktívny plán
                </span>
              )}
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-2">
                <span className="text-2xl font-bold">
                  {p.priceEur === 0 ? "0 €" : `${p.priceEur.toFixed(2)} €`}
                </span>
                <span className="text-sm text-muted-foreground"> / mesiac</span>
              </p>
              {p.prices.yearly && yearlyPerMonthEur(p.key) && (
                <p className="mt-1 text-xs font-medium text-success">
                  alebo {eur(yearlyPerMonthEur(p.key)!)}/mes pri ročnej platbe ·
                  ušetríš {yearlySavingPct(p.key)}%
                </p>
              )}
              <ul className="mt-4 space-y-2">
                {planFeatures(p.key).map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="size-4 shrink-0 text-success" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {current ? (
                  <div className="space-y-3">
                    <span className="text-sm font-medium text-primary">
                      Práve používaš
                    </span>
                    {hasPaidSub && sub?.cancelAtPeriodEnd && (
                      <ResumeSubscription />
                    )}
                  </div>
                ) : p.key === "FREE" ? (
                  hasPaidSub ? (
                    sub?.cancelAtPeriodEnd ? (
                      <span className="text-sm text-muted-foreground">
                        Sem prejdeš{endsAt ? ` ${endsAt}` : ""}
                      </span>
                    ) : (
                      <DowngradeToFree endsAt={endsAt} />
                    )
                  ) : (
                    <span className="text-sm text-muted-foreground">Zadarmo</span>
                  )
                ) : (
                  <UpgradeButtons
                    plan={p.key as "BASIC" | "PRO"}
                    monthlyPriceEur={p.priceEur}
                    yearlyPriceEur={p.prices.yearly ? p.priceEurYearly : null}
                    savingPct={p.prices.yearly ? yearlySavingPct(p.key) : null}
                    subscribed={hasPaidSub}
                  />
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          * Pro plán má neobmedzený počet kreditov v rámci férového použitia.
        </p>
        {sub?.stripeCustomerId && (
          <div className="text-right">
            <ManageSubscriptionButton />
            <p className="mt-1 text-xs text-muted-foreground">
              Zmena platobnej karty
            </p>
          </div>
        )}
      </div>

      {/* Invoices */}
      {sub?.stripeCustomerId && (
        <section>
          <h2 className="mb-3 font-semibold">Faktúry</h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Zatiaľ žiadne faktúry. Prvá sa vystaví po prvej platbe (po skončení
              skúšobnej lehoty).
            </p>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Číslo</th>
                    <th className="px-4 py-2.5 font-medium">Dátum</th>
                    <th className="px-4 py-2.5 font-medium">Suma</th>
                    <th className="px-4 py-2.5 font-medium">Stav</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5">{i.number}</td>
                      <td className="px-4 py-2.5">
                        {i.date.toLocaleDateString("sk-SK")}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {i.amountEur.toFixed(2).replace(".", ",")} €
                      </td>
                      <td className="px-4 py-2.5">
                        {INVOICE_STATUS[i.status] ?? i.status}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {i.url && (
                          <a
                            href={i.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-primary hover:underline"
                          >
                            Zobraziť / PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      )}

      {/* History */}
      <section>
        <h2 className="mb-3 font-semibold">História kreditov</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Zatiaľ žiadne pohyby.</p>
        ) : (
          <Card className="divide-y">
            {history.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium">{creditReasonLabel(t.reason)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.createdAt.toLocaleString("sk-SK")}
                  </p>
                </div>
                <span
                  className={
                    "font-semibold tabular-nums " +
                    (t.amount >= 0 ? "text-success" : "text-muted-foreground")
                  }
                >
                  {t.amount >= 0 ? "+" : ""}
                  {t.amount}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
