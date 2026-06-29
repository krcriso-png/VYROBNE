// Resolve the app's PUBLIC origin (scheme + host), not the internal bind
// address. Behind a proxy (Railway, Vercel) `new URL(req.url).origin` is
// something like http://localhost:8080 — useless in a link sent to a human.
// Prefer an explicit env URL, then the forwarded host headers, then the raw
// request origin as a last resort.
export function publicOrigin(req: Request): string {
  const env =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL;
  if (env) return env.replace(/\/+$/, "");

  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host");
  if (host && !/^localhost|^127\.0\.0\.1/.test(host)) {
    const proto = h.get("x-forwarded-proto") || "https";
    return `${proto}://${host}`;
  }
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

/** Rewrite a localhost/internal URL onto the given public origin (for display). */
export function toPublicUrl(raw: string, origin: string): string {
  try {
    const u = new URL(raw);
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(u.hostname) && origin) {
      return `${origin}${u.pathname}${u.search}`;
    }
    return raw;
  } catch {
    return raw;
  }
}
