import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { profileUpdateSchema } from "@/lib/validation";
import { normalizePhone } from "@/lib/phone";

// GET /api/me — the current user's profile, used to pre-fill contact fields
// (name/email) when creating a listing and on the profile page.
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

// PATCH /api/me — update the current user's profile (name, email, phone,
// optional new password).
export const PATCH = route(async (req: Request) => {
  const u = await requireUser();
  const data = profileUpdateSchema.parse(await req.json());

  const update: {
    name?: string | null;
    email?: string;
    phone?: string | null;
    passwordHash?: string;
  } = {};

  if (data.name !== undefined) update.name = data.name || null;
  if (data.phone !== undefined) update.phone = normalizePhone(data.phone);

  if (data.email !== undefined) {
    const email = data.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== u.id) {
      throw new HttpError(409, "Tento email už používa iný účet");
    }
    update.email = email;
  }

  if (data.password) {
    // Changing an existing password requires the current one; only an account
    // with no password yet (e.g. Google-only) may set one without it.
    const current = await prisma.user.findUnique({
      where: { id: u.id },
      select: { passwordHash: true },
    });
    if (current?.passwordHash) {
      const ok =
        !!data.currentPassword &&
        (await bcrypt.compare(data.currentPassword, current.passwordHash));
      if (!ok) {
        throw new HttpError(400, "Súčasné heslo je nesprávne.");
      }
    }
    update.passwordHash = await bcrypt.hash(data.password, 12);
  }

  const user = await prisma.user.update({
    where: { id: u.id },
    data: update,
    select: { name: true, email: true, phone: true },
  });

  return json({
    name: user.name,
    email: user.email,
    phone: user.phone,
  });
});
