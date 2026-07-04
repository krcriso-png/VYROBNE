import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers, LogOut, Coins, Ban } from "lucide-react";
import { auth, signOut } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";
import { MobileNav } from "@/components/MobileNav";
import { Button } from "@/components/ui/button";
import { getCreditState } from "@/lib/credits";
import { prisma } from "@/lib/db";

// Shared shell for the authenticated area: sidebar nav + sign-out.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // A blocked account keeps its JWT until it expires, so re-check the DB flag on
  // every page load and lock the whole UI out if it's blocked (the API already
  // rejects every action). This makes "zablokovať účet" real, not cosmetic.
  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { blocked: true },
  });
  if (account?.blocked) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <div className="max-w-md space-y-4 rounded-2xl border bg-card p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive">
            <Ban className="size-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Účet je zablokovaný</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Váš účet bol zablokovaný administrátorom. Podrobnosti sme vám
              poslali e-mailom. Ak si myslíte, že ide o omyl, napíšte nám na{" "}
              <a
                href="mailto:info@klikado.sk"
                className="font-medium text-primary"
              >
                info@klikado.sk
              </a>
              .
            </p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <Button variant="outline" className="w-full">
              <LogOut className="size-4" /> Odhlásiť sa
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const initial =
    (session.user.name ?? session.user.email ?? "?").charAt(0).toUpperCase();

  const credit = await getCreditState(session.user.id);

  // Red nav badge = things that need action. For a user: their threads with a
  // new reply. For the admin: support threads with a new message PLUS failed
  // publications (so real problems — tickets AND auto publish errors — blink).
  // These are clearable (reply to the ticket / resolve the error), so once
  // everything is handled the badge disappears.
  const isAdmin = session.user.role === "ADMIN";
  const [supportUnread, adminAlert] = await Promise.all([
    prisma.supportThread.count({
      where: isAdmin
        ? { adminUnread: true }
        : { userId: session.user.id, userUnread: true },
    }),
    isAdmin
      ? prisma.publication.count({ where: { status: "ERROR" } })
      : Promise.resolve(0),
  ]);

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card p-4 md:flex">
        <Link href="/dashboard" className="mb-8 flex items-center gap-2 px-2">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Layers className="size-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">Klikado</span>
        </Link>

        <Link
          href="/billing"
          className="mb-4 flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5 transition-colors hover:bg-muted"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Coins className="size-4 text-primary" /> Kredity
          </span>
          <span className="text-sm font-bold tabular-nums">
            {credit.unlimited ? "∞" : credit.credits}
          </span>
        </Link>

        <AppNav
          isAdmin={isAdmin}
          supportUnread={supportUnread}
          adminAlert={adminAlert}
        />

        <div className="mt-auto border-t pt-4">
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {session.user.name ?? "Používateľ"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {session.user.email}
              </p>
            </div>
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full justify-start text-muted-foreground"
            >
              <LogOut className="size-4" /> Odhlásiť sa
            </Button>
          </form>
        </div>
      </aside>

      {/* min-w-0 lets this flex column shrink to the viewport (a flex item
          defaults to min-width:auto and would otherwise overflow on mobile);
          overflow-x-hidden is a hard guard against any stray wide child. */}
      <div className="w-full min-w-0 flex-1 overflow-x-hidden">
        <MobileNav
          isAdmin={isAdmin}
          supportUnread={supportUnread}
          adminAlert={adminAlert}
          credits={credit.unlimited ? "∞" : String(credit.credits)}
          userName={session.user.name ?? "Používateľ"}
          userEmail={session.user.email ?? ""}
        />
        <main className="mx-auto max-w-6xl animate-fade-in px-4 py-8 sm:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
