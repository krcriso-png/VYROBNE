import Link from "next/link";
import { Layers } from "lucide-react";
import { OPERATOR } from "@/lib/legal";

// Shared shell for the public legal pages: a clean, readable container with a
// header back to the site and a footer linking the documents to each other.
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-muted/20">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Layers className="size-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              {OPERATOR.brand}
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Späť na web
          </Link>
        </div>
      </header>

      <article
        className="prose-legal mx-auto max-w-3xl px-5 py-10 [&_a]:font-medium [&_a]:text-primary hover:[&_a]:underline [&_h1]:mb-2 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_p]:leading-relaxed [&_p]:text-foreground/90 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
      >
        {children}
      </article>

      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-6 text-sm text-muted-foreground">
          <Link href="/obchodne-podmienky">Obchodné podmienky</Link>
          <Link href="/ochrana-osobnych-udajov">Ochrana osobných údajov</Link>
          <Link href="/cookies">Cookies</Link>
          <span className="ml-auto">
            © {new Date().getFullYear()} {OPERATOR.brand}
          </span>
        </div>
      </footer>
    </main>
  );
}
