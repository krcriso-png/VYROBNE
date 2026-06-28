import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Prehľad" },
  { href: "/listings", label: "Inzeráty" },
  { href: "/portals", label: "Portály" },
  { href: "/billing", label: "Predplatné" },
];

// Shared shell for the authenticated area: sidebar nav + sign-out.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r bg-card p-4">
        <Link href="/dashboard" className="mb-8 px-2 text-lg font-bold">
          Inzeromat
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          {session.user.role === "ADMIN" && (
            <Link
              href="/admin"
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Admin
            </Link>
          )}
        </nav>
        <div className="border-t pt-4 text-sm">
          <p className="truncate px-2 text-muted-foreground">
            {session.user.email}
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="mt-2 w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted">
              Odhlásiť sa
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 bg-background p-8">{children}</main>
    </div>
  );
}
