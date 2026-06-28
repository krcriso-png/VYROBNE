"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  Plug,
  CreditCard,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Prehľad", icon: LayoutDashboard },
  { href: "/listings", label: "Inzeráty", icon: ListChecks },
  { href: "/portals", label: "Portály", icon: Plug },
  { href: "/billing", label: "Predplatné", icon: CreditCard },
];

export function AppNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin
    ? [...ITEMS, { href: "/admin", label: "Admin", icon: ShieldCheck }]
    : ITEMS;

  return (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
