import { HttpError } from "./api";

// ===========================================================================
// Lightweight in-memory rate limiter (fixed window per key).
//
// Guards public, abusable endpoints (sign-up, password reset) from bots and
// brute force without extra infrastructure. Single-instance friendly; if we
// ever scale horizontally, swap the Map for Redis (BullMQ's connection is
// already available). Fails OPEN on internal errors so a limiter bug can never
// lock real users out.
// ===========================================================================

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodically drop expired buckets so the Map can't grow unbounded.
const SWEEP_MS = 5 * 60 * 1000;
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < SWEEP_MS) return;
  lastSweep = now;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}

/** Best-effort client IP from proxy headers (Railway sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/**
 * Throw HttpError(429) when `key` exceeds `limit` requests within `windowMs`.
 * Call at the top of a handler, e.g. rateLimit(`register:${clientIp(req)}`).
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): void {
  try {
    const now = Date.now();
    sweep(now);
    const b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    b.count += 1;
    if (b.count > limit) {
      const secs = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      throw new HttpError(
        429,
        `Príliš veľa pokusov. Skús to znova o ${secs} s.`,
      );
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    // Any unexpected error → don't block a legitimate user.
  }
}

/**
 * Simple honeypot: bots fill every field, humans never see this one. If the
 * hidden field carries any value, reject as spam.
 */
export function honeypot(value: unknown): void {
  if (typeof value === "string" && value.trim().length > 0) {
    throw new HttpError(400, "Neplatná požiadavka.");
  }
}
