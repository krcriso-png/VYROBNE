"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Periodically re-fetches the current server component tree so live data
// (view counts, ad dates, statuses) update without a manual page reload.
export function AutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
