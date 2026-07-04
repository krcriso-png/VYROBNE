import Link from "next/link";
import {
  Layers,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  Check,
  Clock,
  TrendingUp,
  Trash2,
  Bell,
  Sparkles,
  PencilLine,
  MousePointerClick,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { OPERATOR } from "@/lib/legal";
import {
  PLANS as PLAN_DEFS,
  yearlySavingPct,
  yearlyPerMonthEur,
  eur,
} from "@/lib/plans";

// Portals we really publish to today (be honest — no vapourware on the page).
const PORTALS = ["Bazoš SK", "Bazoš CZ", "Bazar.sk"];

const STEPS = [
  {
    icon: PencilLine,
    title: "1. Vytvor inzerát raz",
    body: "Napíš názov, popis, cenu a nahraj fotky. Raz — a máš hotovo pre všetky portály.",
  },
  {
    icon: MousePointerClick,
    title: "2. Vyber portály a klikni",
    body: "Zaškrtni, kam to má ísť (Bazoš SK/CZ, Bazar.sk) a stlač Publikovať. Zvyšok spraví Klikado.",
  },
  {
    icon: TrendingUp,
    title: "3. My to udržíme hore",
    body: "Klikado inzerát automaticky topuje v intervale, ktorý si zvolíš — aby bol stále navrchu a videlo ho viac ľudí.",
  },
];

const BENEFITS = [
  {
    icon: Clock,
    title: "Ušetríš hodiny",
    body: "Namiesto vypĺňania toho istého formulára na každom portáli zvlášť to spravíš raz. Pri viacerých inzerátoch sú to ušetrené hodiny každý týždeň.",
  },
  {
    icon: TrendingUp,
    title: "Automatické topovanie",
    body: "Inzerát sám posunieme navrch každý deň, každé 3 dni, týždeň — ako chceš. Vždy pred novým pridaním starý bezpečne zmažeme, aby ti portál nedal ban za duplicitu.",
  },
  {
    icon: RefreshCw,
    title: "Jedna zmena = všade",
    body: "Znížil si cenu alebo pridal fotku? Uprav to na jednom mieste a Klikado to premietne na všetky portály.",
  },
  {
    icon: Trash2,
    title: "Predané? Zmaž všade naraz",
    body: "Keď vec predáš, jedným klikom ju stiahneš zo všetkých portálov. Žiadne otravné telefonáty na už predaný tovar.",
  },
  {
    icon: Bell,
    title: "Vždy vieš, čo sa deje",
    body: "Klikado kontroluje, či je inzerát naozaj online, a upozorní ťa e-mailom, keď treba niečo doriešiť (napr. overenie telefónu).",
  },
  {
    icon: ShieldCheck,
    title: "Tvoje údaje v bezpečí",
    body: "Prístupy k portálom sú šifrované a nikde sa nezobrazujú. Ty ostávaš majiteľom svojich inzerátov aj kontaktov.",
  },
];

const FAQ = [
  {
    q: "Potrebujem účty na tých portáloch?",
    a: "Nie nutne. Bazoš aj Bazar.sk umožňujú pridať inzerát aj bez registrácie — stačí e-mail a telefón. Klikado to za teba vyplní a inzerát zverejní.",
  },
  {
    q: "Ako je to s SMS overením telefónu?",
    a: "Niektoré portály (napr. Bazar.sk) vyžadujú jednorazové overenie čísla cez SMS kód. Klikado ťa vyzve zadať kód a overenie si zapamätá, takže ďalšie inzeráty už SMS pýtať nebudú.",
  },
  {
    q: "Nedostanem ban za duplicitné inzeráty?",
    a: "Práve preto Klikado pri topovaní najprv starý inzerát zmaže, overí, že je naozaj preč, a až potom pridá nový. Nikdy nevznikne duplikát — to je náš hlavný dôraz.",
  },
  {
    q: "Koľko ma to stojí?",
    a: "Začni zadarmo. Platíš kreditmi — 1 kredit = jedno pridanie alebo jedno topovanie. Vyber si mesačný alebo lacnejší ročný plán, zrušiť môžeš kedykoľvek.",
  },
  {
    q: "Pribudnú ďalšie portály?",
    a: "Áno. Aktuálne publikujeme na Bazoš SK, Bazoš CZ a Bazar.sk a pracujeme na ďalších. Každý nový portál sa objaví automaticky v tvojom účte.",
  },
];

// Pricing cards derive from the single source of truth (src/lib/plans.ts) so
// the public page never drifts from the in-app billing plans.
const PLANS = (["FREE", "BASIC", "PRO"] as const).map((k) => {
  const p = PLAN_DEFS[k];
  return {
    name: p.name,
    price: p.priceEur === 0 ? "0 €" : `${p.priceEur.toFixed(2)} €`,
    note: "/mesiac",
    yearly: p.priceEurYearly
      ? `alebo ${eur(yearlyPerMonthEur(k)!)}/mes pri ročnej platbe · ušetríš ${yearlySavingPct(k)}%`
      : null,
    features: [
      p.monthlyCredits === null
        ? "Neobmedzene kreditov*"
        : `${p.monthlyCredits} kreditov / mesiac`,
      "1 kredit = pridanie alebo topovanie",
      "Všetky portály (Bazoš SK/CZ, Bazar.sk)",
      "Automatické topovanie bez duplicít",
      k === "PRO" ? "Prioritné spracovanie" : "Synchronizácia zmien",
    ],
    highlight: k === "BASIC",
  };
});

export default async function HomePage() {
  // Reflect the logged-in state so opening klikado.sk in a new window/tab while
  // signed in shows "Prejsť do aplikácie" instead of "Prihlásiť sa".
  const session = await auth();
  const loggedIn = !!session?.user;
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Nav */}
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Layers className="size-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">Klikado</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="#ako-to-funguje" className="hidden sm:block">
              <Button variant="ghost" size="sm">
                Ako to funguje
              </Button>
            </Link>
            <Link href="#cennik" className="hidden sm:block">
              <Button variant="ghost" size="sm">
                Cenník
              </Button>
            </Link>
            {loggedIn ? (
              <Link href="/dashboard">
                <Button size="sm" className="gap-1.5">
                  Prejsť do aplikácie <ArrowRight className="size-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm">
                    Prihlásiť sa
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm">Začať zadarmo</Button>
                </Link>
              </>
            )}
          </nav>
        </header>

        {/* Hero */}
        <section className="py-16 text-center sm:py-24">
          <Badge tone="primary" className="mx-auto mb-6">
            <Sparkles className="size-3.5" /> Predávaj rýchlejšie, klikaj menej
          </Badge>
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-extrabold tracking-tight sm:text-6xl">
            Jeden inzerát.{" "}
            <span className="bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
              Všetky portály.
            </span>{" "}
            Automaticky.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
            Vytvor inzerát raz a Klikado ho pridá a udrží navrchu na{" "}
            <strong className="text-foreground">Bazoš SK, Bazoš CZ</strong> a{" "}
            <strong className="text-foreground">Bazar.sk</strong>. Žiadne
            opakované prihlasovanie, vypĺňanie a kopírovanie.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={loggedIn ? "/dashboard" : "/register"}>
              <Button size="lg" className="gap-2">
                {loggedIn ? "Prejsť do aplikácie" : "Vyskúšať 7 dní zadarmo"}{" "}
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link href="#ako-to-funguje">
              <Button size="lg" variant="outline">
                Ako to funguje
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Bez záväzkov · Zrušíš kedykoľvek · Netreba platobnú kartu
          </p>

          {/* Portals strip */}
          <div className="mx-auto mt-14 max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Publikujeme na
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              {PORTALS.map((p) => (
                <span
                  key={p}
                  className="rounded-full border bg-card px-4 py-1.5 text-sm font-semibold shadow-soft"
                >
                  {p}
                </span>
              ))}
              <span className="rounded-full border border-dashed px-4 py-1.5 text-sm text-muted-foreground">
                ďalšie pripravujeme…
              </span>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="ako-to-funguje" className="scroll-mt-20 pb-16">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Ako to funguje
            </h2>
            <p className="mt-2 text-muted-foreground">
              Tri kroky a máš hotovo. Zvyšok beží na pozadí.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.title}
                className="rounded-xl border bg-card p-6 shadow-soft"
              >
                <div className="mb-4 grid size-11 place-items-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="size-5" />
                </div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Benefits */}
        <section className="pb-16">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Prečo Klikado
            </h2>
            <p className="mt-2 text-muted-foreground">
              Menej klikania, viac kupujúcich — a pokoj v hlave.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((f) => (
              <div
                key={f.title}
                className="group rounded-xl border bg-card p-6 shadow-soft transition-shadow hover:shadow-card"
              >
                <div className="mb-4 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="size-5" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="cennik" className="scroll-mt-20 pb-20">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Jednoduchý cenník
            </h2>
            <p className="mt-2 text-muted-foreground">
              Začni zadarmo, plať až keď rastieš.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={
                  "relative rounded-xl border bg-card p-6 shadow-soft " +
                  (p.highlight ? "ring-2 ring-primary" : "")
                }
              >
                {p.highlight && (
                  <Badge tone="primary" className="absolute -top-3 left-6">
                    Najobľúbenejší
                  </Badge>
                )}
                <h3 className="font-semibold">{p.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{p.price}</span>
                  <span className="text-sm text-muted-foreground">
                    {p.note}
                  </span>
                </div>
                {p.yearly && (
                  <p className="mt-1 text-xs font-medium text-success">
                    {p.yearly}
                  </p>
                )}
                <ul className="mt-6 space-y-2.5">
                  {p.features.map((feat) => (
                    <li
                      key={feat}
                      className="flex items-start gap-2 text-sm"
                    >
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />{" "}
                      {feat}
                    </li>
                  ))}
                </ul>
                <Link href="/register" className="mt-6 block">
                  <Button
                    className="w-full"
                    variant={p.highlight ? "primary" : "outline"}
                  >
                    Vybrať {p.name}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            * Pro plán má neobmedzený počet kreditov v rámci férového použitia.
            Ceny sú uvedené s DPH.
          </p>
        </section>

        {/* FAQ */}
        <section className="pb-20">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Časté otázky
            </h2>
          </div>
          <div className="mx-auto max-w-3xl divide-y rounded-xl border bg-card shadow-soft">
            {FAQ.map((item) => (
              <details key={item.q} className="group px-6 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {item.q}
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="pb-20">
          <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 to-indigo-400/10 p-10 text-center">
            <h2 className="text-balance text-3xl font-bold tracking-tight">
              Pridaj svoj prvý inzerát ešte dnes
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Vyskúšaj Klikado 7 dní zadarmo. Bez karty, bez záväzkov — a uvidíš,
              koľko času ti to ušetrí.
            </p>
            <Link href="/register" className="mt-7 inline-block">
              <Button size="lg" className="gap-2">
                Začať zadarmo <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </section>

        <footer className="border-t py-8">
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground sm:flex-row sm:justify-between">
            <span>
              © {new Date().getFullYear()} {OPERATOR.brand}
              {OPERATOR.legalName.startsWith("[")
                ? ""
                : ` · ${OPERATOR.legalName}`}
            </span>
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
              <Link href="/obchodne-podmienky" className="hover:text-foreground">
                Obchodné podmienky
              </Link>
              <Link
                href="/ochrana-osobnych-udajov"
                className="hover:text-foreground"
              >
                Ochrana osobných údajov
              </Link>
              <Link href="/cookies" className="hover:text-foreground">
                Cookies
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </main>
  );
}
