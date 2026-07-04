"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  Plug,
  CreditCard,
  LifeBuoy,
  ShieldCheck,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Prehľad", icon: LayoutDashboard },
  { href: "/listings", label: "Inzeráty", icon: ListChecks },
  { href: "/portals", label: "Portály", icon: Plug },
  { href: "/billing", label: "Predplatné", icon: CreditCard },
  { href: "/podpora", label: "Podpora", icon: LifeBuoy },
  { href: "/profile", label: "Profil", icon: User },
];

export const ADMIN_ITEM = {
  href: "/admin",
  label: "Admin",
  icon: ShieldCheck,
};

export function navItemsFor(isAdmin: boolean) {
  // Admin handles all support inside the Admin panel, so the customer-facing
  // "Podpora" item is hidden for admins.
  return isAdmin
    ? [...NAV_ITEMS.filter((i) => i.href !== "/podpora"), ADMIN_ITEM]
    : NAV_ITEMS;
}

export function AppNav({
  isAdmin,
  supportUnread = 0,
}: {
  isAdmin: boolean;
  supportUnread?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const items = navItemsFor(isAdmin);

  // Keep the support alert live without a manual reload: periodically re-fetch
  // the server layout so a new ticket lights up the menu on its own.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        // Only support threads awaiting a reply count as "needs action".
        const count =
          item.href === "/podpora" || item.href === "/admin" ? supportUnread : 0;
        const badge = count > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : badge
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
            <span className="flex-1">{item.label}</span>
            {badge && (
              <span className="grid min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground shadow-sm">
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
