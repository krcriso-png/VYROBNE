"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Layers, Menu, X, Coins, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItemsFor } from "./AppNav";

// Top bar + slide-out drawer for phones (the sidebar is hidden under md).
export function MobileNav({
  isAdmin,
  supportUnread = 0,
  credits,
  userName,
  userEmail,
}: {
  isAdmin: boolean;
  supportUnread?: number;
  credits: string;
  userName: string;
  userEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const items = navItemsFor(isAdmin);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Layers className="size-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">Klikado</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/billing"
            className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-sm font-semibold"
          >
            <Coins className="size-4 text-primary" /> {credits}
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Otvoriť menu"
            className="grid size-9 place-items-center rounded-lg border"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-0 flex h-full w-72 flex-col bg-card p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <span className="text-lg font-bold tracking-tight">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Zavrieť menu"
                className="grid size-9 place-items-center rounded-lg border"
              >
                <X className="size-5" />
              </button>
            </div>

            <nav className="flex flex-col gap-1">
              {items.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                const badge = item.href === "/podpora" && supportUnread > 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
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

            <div className="mt-auto border-t pt-4">
              <div className="px-1">
                <p className="truncate text-sm font-medium">{userName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {userEmail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                <LogOut className="size-4" /> Odhlásiť sa
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
