import Link from "next/link";

// Public landing page. Kept intentionally lightweight; the real product lives
// behind authentication in the (app) route group.
const FEATURES = [
  {
    title: "Jeden inzerát, všade",
    body: "Vytvor inzerát raz a publikuj ho automaticky na Bazoš, Bazar.sk, Marketplace a ďalšie portály.",
  },
  {
    title: "Automatická synchronizácia",
    body: "Zmeníš cenu alebo fotky? Systém upraví inzerát na všetkých portáloch za teba.",
  },
  {
    title: "Automatická obnova",
    body: "Posúvanie inzerátov každých 24/48 hodín alebo týždeň — plne automaticky.",
  },
  {
    title: "Modulárne portály",
    body: "Každý portál je plugin s rovnakým rozhraním. Nové portály pribúdajú bez zásahu do zvyšku systému.",
  },
];

const PLANS = [
  { name: "Free", price: "0 €", note: "max 3 inzeráty" },
  { name: "Basic", price: "9 €/mes", note: "30 aktívnych inzerátov" },
  { name: "Pro", price: "19 €/mes", note: "neobmedzene" },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="flex items-center justify-between">
        <span className="text-xl font-bold">Inzeromat</span>
        <nav className="flex gap-4 text-sm">
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            Prihlásiť sa
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
          >
            Začať zadarmo
          </Link>
        </nav>
      </header>

      <section className="py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-5xl font-extrabold tracking-tight">
          Jeden inzerát. Všetky inzertné portály.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Spravuj a automaticky publikuj svoje inzeráty na viacerých portáloch
          z jedného miesta. Už žiadne manuálne prihlasovanie a kopírovanie.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/register"
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground"
          >
            Vyskúšať 7 dní zadarmo
          </Link>
          <Link
            href="/login"
            className="rounded-md border px-6 py-3 font-medium"
          >
            Mám účet
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border bg-card p-6">
            <h3 className="text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-20">
        <h2 className="text-center text-2xl font-bold">Cenník</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.name} className="rounded-xl border bg-card p-6 text-center">
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-2 text-3xl font-bold">{p.price}</p>
              <p className="mt-2 text-sm text-muted-foreground">{p.note}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-20 border-t pt-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Inzeromat — API-first SaaS.
      </footer>
    </main>
  );
}
