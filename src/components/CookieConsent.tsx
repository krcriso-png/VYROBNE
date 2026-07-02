"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";

// Lightweight cookie-consent bar. The app only sets strictly-necessary cookies
// (login session), so there's nothing to load conditionally — the bar records
// the user's choice and stops showing. If analytics/marketing cookies are added
// later, gate them on `klikado_cookie_consent === "all"`.
const KEY = "klikado_cookie_consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setVisible(true);
    } catch {
      /* storage blocked — don't nag */
    }
  }, []);

  function choose(value: "all" | "necessary") {
    try {
      localStorage.setItem(KEY, value);
      // Also drop a 1-year cookie so a server could read the choice if needed.
      document.cookie = `${KEY}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border bg-card p-4 shadow-card sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <Cookie className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Používame iba nevyhnutné cookies potrebné na fungovanie a
            prihlásenie. Podrobnosti nájdeš v{" "}
            <Link href="/cookies" className="font-medium text-primary hover:underline">
              zásadách používania cookies
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={() => choose("necessary")}
            className="flex-1 rounded-lg border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-muted sm:flex-none"
          >
            Len nevyhnutné
          </button>
          <button
            type="button"
            onClick={() => choose("all")}
            className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:flex-none"
          >
            Rozumiem
          </button>
        </div>
      </div>
    </div>
  );
}
