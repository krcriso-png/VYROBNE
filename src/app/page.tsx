import Link from "next/link";
import {
  Layers,
  RefreshCw,
  Timer,
  Puzzle,
  ShieldCheck,
  Image as ImageIcon,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const FEATURES = [
  {
    icon: Layers,
    title: "Jeden inzerát, všade",
    body: "Vytvor inzerát raz a publikuj ho automaticky na Bazoš, Bazar.sk, Marketplace a ďalšie portály.",
  },
  {
    icon: RefreshCw,
    title: "Automatická synchronizácia",
    body: "Zmeníš cenu alebo fotky? Systém upraví inzerát na všetkých portáloch za teba.",
  },
  {
    icon: Timer,
    title: "Automatická obnova",
    body: "Posúvanie inzerátov každých 24/48 hodín alebo týždeň — plne automaticky.",
  },
  {
    icon: Puzzle,
    title: "Modulárne portály",
    body: "Každý portál je plugin s rovnakým rozhraním. Nové portály pribúdajú bez zásahu do systému.",
  },
  {
    icon: ShieldCheck,
    title: "Bezpečné údaje",
    body: "Prihlasovacie údaje na portály sú šifrované (AES-256-GCM) a nikdy sa nezobrazujú.",
  },
  {
    icon: ImageIcon,
    title: "Chytré fotky",
    body: "Automatický resize, kompresia, konverzia na WebP, zmena poradia a hlavná fotografia.",
  },
];

const PLANS = [
  { name: "Free", price: "0 €", note: "max 3 inzeráty", features: ["3 aktívne inzeráty", "Všetky portály", "Manuálne publikovanie"] },
  { name: "Basic", price: "9 €", note: "/mesiac", features: ["30 aktívnych inzerátov", "Automatická obnova", "Synchronizácia zmien"], highlight: true },
  { name: "Pro", price: "19 €", note: "/mesiac", features: ["Neobmedzene inzerátov", "Prioritné spracovanie", "Všetky funkcie"] },
];

export default function HomePage() {
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
            <span className="text-lg font-bold tracking-tight">Inzeromat</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">Prihlásiť sa</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Začať zadarmo</Button>
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="py-20 text-center">
          <Badge tone="primary" className="mx-auto mb-6">
            <span className="size-1.5 rounded-full bg-primary" /> Nová generácia inzercie
          </Badge>
          <h1 className="mx-auto max-w-3xl text-balance text-5xl font-extrabold tracking-tight sm:text-6xl">
            Jeden inzerát.{" "}
            <span className="bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
              Všetky portály.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
            Spravuj a automaticky publikuj svoje inzeráty na viacerých portáloch
            z jedného miesta. Už žiadne manuálne prihlasovanie a kopírovanie.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register">
              <Button size="lg" className="gap-2">
                Vyskúšať 7 dní zadarmo <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">Mám účet</Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Bez záväzkov · Zrušíš kedykoľvek
          </p>
        </section>

        {/* Features */}
        <section className="grid gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
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
        </section>

        {/* Pricing */}
        <section className="pb-20">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Jednoduchý cenník</h2>
            <p className="mt-2 text-muted-foreground">
              Začni zadarmo, plať keď rastieš.
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
                  <span className="text-sm text-muted-foreground">{p.note}</span>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2 text-sm">
                      <Check className="size-4 text-success" /> {feat}
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
        </section>

        <footer className="border-t py-8 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Inzeromat · API-first SaaS
        </footer>
      </div>
    </main>
  );
}
