import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Use the Edge-safe config (no bcrypt / Prisma) for middleware auth.
const { auth } = NextAuth(authConfig);

// ===========================================================================
// Route protection
//
// Gate the authenticated app area (/dashboard, /listings, /portals, /billing)
// and the user-scoped API. Unauthenticated users are redirected to /login;
// API calls get a 401 JSON response instead of a redirect.
// ===========================================================================

const PROTECTED_PAGES = ["/dashboard", "/listings", "/portals", "/billing", "/admin"];
const PUBLIC_API = ["/api/auth", "/api/register", "/api/webhooks"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth?.user;

  const isProtectedPage = PROTECTED_PAGES.some((p) => pathname.startsWith(p));
  const isApi = pathname.startsWith("/api");
  const isPublicApi = PUBLIC_API.some((p) => pathname.startsWith(p));

  if (isApi && !isPublicApi && !isLoggedIn) {
    return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });
  }

  if (isProtectedPage && !isLoggedIn) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Run on app pages and API, excluding static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
