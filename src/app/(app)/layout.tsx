import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers, LogOut, Coins } from "lucide-react";
import { auth, signOut } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { getCreditState } from "@/lib/credits";

// Shared shell for the authenticated area: sidebar nav + sign-out.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const initial =
    (session.user.name ?? session.user.email ?? "?").charAt(0).toUpperCase();

  const credit = await getCreditState(session.user.id);

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

        <AppNav isAdmin={session.user.role === "ADMIN"} />

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

      <div className="flex-1">
        <main className="mx-auto max-w-6xl animate-fade-in px-5 py-8 sm:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
