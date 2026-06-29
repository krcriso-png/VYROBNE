import { prisma } from "@/lib/db";
import { route, json, requireUser } from "@/lib/api";

// GET /api/me — the current user's profile, used to pre-fill contact fields
// (name/email) when creating a listing.
export const GET = route(async () => {
  const u = await requireUser();
  const user = await prisma.user.findUnique({
    where: { id: u.id },
    select: { name: true, email: true, phone: true },
  });
  return json({
    name: user?.name ?? null,
    email: user?.email ?? null,
    phone: user?.phone ?? null,
  });
});
