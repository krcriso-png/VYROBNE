import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { route, json, HttpError } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { normalizePhone } from "@/lib/phone";

// POST /api/register — email+password sign-up.
// Creates the user, a FREE subscription, and (in a full deployment) sends an
// email-verification token. OAuth sign-ups go through Auth.js instead.
export const POST = route(async (req: Request) => {
  const body = await req.json();
  const parsed = registerSchema.parse(body);
  // Store emails lowercased so login matches regardless of capitalisation.
  const email = parsed.email.toLowerCase().trim();
  const { password, name, phone } = parsed;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, "Email je už zaregistrovaný");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      phone: normalizePhone(phone),
      passwordHash,
      subscription: { create: { plan: "FREE", status: "ACTIVE" } },
    },
    select: { id: true, email: true },
  });

  // TODO: issue a VerificationToken and send the verification email.
  return json({ id: user.id, email: user.email }, { status: 201 });
});
