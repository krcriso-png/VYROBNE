import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./db";

// ===========================================================================
// Authentication (Auth.js / NextAuth v5)
//
// Supports email+password (Credentials) and Google OAuth. Apple is planned.
// Sessions are JWT-based so the worker and API can verify without a DB round
// trip. New users get a FREE subscription row via the createUser event.
//
// Email verification: OAuth sign-ins are pre-verified by the provider;
// password sign-ups must verify via a token (see src/lib/email + the
// verification route) before they can publish.
// ===========================================================================

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash || user.blocked) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
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
  events: {
    // Ensure every new user has a subscription record (FREE by default).
    createUser: async ({ user }) => {
      if (!user.id) return;
      await prisma.subscription.upsert({
        where: { userId: user.id },
        create: { userId: user.id, plan: "FREE", status: "ACTIVE" },
        update: {},
      });
    },
  },
});
