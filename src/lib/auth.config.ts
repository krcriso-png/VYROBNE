import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// ===========================================================================
// Edge-safe auth configuration
//
// This config contains ONLY things that run in the Edge runtime (middleware):
// session strategy, pages, the OAuth provider declaration and the JWT/session
// callbacks. It must not import Node-only code (bcrypt, Prisma) — those live
// in `auth.ts`, which augments this config for the Node runtime (API routes).
//
// Splitting like this is the recommended NextAuth v5 pattern and avoids the
// "Node.js API used in Edge Runtime" warnings from bundling bcrypt into
// middleware.
// ===========================================================================

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.uid = user.id;
        token.role = user.role ?? "USER";
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = (token.role as "USER" | "ADMIN") ?? "USER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
