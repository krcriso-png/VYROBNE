import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./db";
import { authConfig } from "./auth.config";

// ===========================================================================
// Authentication (Auth.js / NextAuth v5) — Node runtime
//
// Builds on the Edge-safe `authConfig` and adds the Node-only pieces: the
// Prisma adapter, the Credentials (email+password) provider that uses bcrypt,
// and the createUser event. Used by API route handlers and server components.
// The middleware uses `authConfig` directly so bcrypt/Prisma never reach Edge.
// ===========================================================================

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    ...authConfig.providers,
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
