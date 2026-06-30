"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  return isAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;
}

export function AppNav({
  isAdmin,
  supportUnread = 0,
}: {
  isAdmin: boolean;
  supportUnread?: number;
}) {
  const pathname = usePathname();
  const items = navItemsFor(isAdmin);

  return (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const badge = item.href === "/podpora" && supportUnread > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
            <span className="flex-1">{item.label}</span>
            {badge && (
              <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {supportUnread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
