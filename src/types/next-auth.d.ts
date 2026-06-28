import type { UserRole } from "@prisma/client";
import "next-auth";

// Augment the session/user with our custom fields (id, role).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    role?: UserRole;
  }
}
