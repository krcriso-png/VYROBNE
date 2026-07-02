import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { route, json, HttpError } from "@/lib/api";
import { resetPasswordSchema } from "@/lib/validation";

// POST /api/auth/reset — complete a password reset.
// Body: { email, token, password }. Verifies the one-time token, sets the new
// password and consumes every reset token for that address.
export const POST = route(async (req: Request) => {
  const { email: rawEmail, token, password } = resetPasswordSchema.parse(
    await req.json(),
  );
  const email = rawEmail.toLowerCase().trim();

  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });
  if (!record || record.identifier !== email) {
    throw new HttpError(400, "Odkaz je neplatný. Požiadaj o nový.");
  }
  if (record.expires < new Date()) {
    await prisma.verificationToken
      .deleteMany({ where: { identifier: email } })
      .catch(() => {});
    throw new HttpError(400, "Platnosť odkazu vypršala. Požiadaj o nový.");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new HttpError(400, "Účet neexistuje.");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });
  // Consume the token(s) so the link can't be reused.
  await prisma.verificationToken
    .deleteMany({ where: { identifier: email } })
    .catch(() => {});

  return json({ ok: true });
});
