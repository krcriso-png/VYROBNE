import crypto from "crypto";
import { prisma } from "@/lib/db";
import { route, json } from "@/lib/api";
import { forgotPasswordSchema } from "@/lib/validation";
import { sendEmail, renderBrandedEmail } from "@/lib/email";

// POST /api/auth/forgot — start a password reset.
// Body: { email }. Always responds { ok: true } (never reveals whether the
// address exists). When the account exists AND has a password, a one-hour
// reset link is e-mailed. Reset tokens live in the VerificationToken table
// (unused otherwise, since we sign in with JWT sessions).
export const POST = route(async (req: Request) => {
  const { email: rawEmail } = forgotPasswordSchema.parse(await req.json());
  const email = rawEmail.toLowerCase().trim();

  const user = await prisma.user.findUnique({ where: { email } });
  // Only send for accounts that actually use a password (OAuth-only accounts
  // sign in with Google and have nothing to reset).
  if (user?.passwordHash) {
    // Invalidate any previous reset tokens for this address, then mint a fresh
    // one valid for one hour.
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const base = (
      process.env.AUTH_URL ??
      new URL(req.url).origin
    ).replace(/\/$/, "");
    const link = `${base}/reset-password?token=${token}&email=${encodeURIComponent(
      email,
    )}`;

    // Fire-and-forget: never make the browser wait on SMTP. The response returns
    // immediately; the mail is sent in the background (with its own timeouts).
    void sendEmail({
      to: email,
      subject: "Klikado – obnovenie hesla",
      text:
        `Ahoj,\n\npožiadal si o obnovenie hesla do Klikado. Klikni na odkaz nižšie ` +
        `a nastav si nové heslo (odkaz platí 1 hodinu):\n\n${link}\n\n` +
        `Ak si o zmenu nežiadal, tento e-mail ignoruj — tvoje heslo zostáva nezmenené.`,
      html: renderBrandedEmail({
        heading: "Obnovenie hesla",
        paragraphs: [
          "Ahoj, požiadal si o obnovenie hesla do Klikado.",
          "Klikni na tlačidlo nižšie a nastav si nové heslo. Odkaz platí <strong>1 hodinu</strong>.",
        ],
        button: { label: "Nastaviť nové heslo", url: link },
        footerNote:
          "Ak si o zmenu nežiadal, tento e-mail pokojne ignoruj — tvoje heslo zostáva nezmenené.",
      }),
    })
      .then((sent) => {
        if (!sent) {
          // SMTP not configured / failed — log the link so a reset is still
          // possible from the server logs. Never surfaced to the client.
          // eslint-disable-next-line no-console
          console.log(`[forgot] reset link for ${email}: ${link}`);
        }
      })
      .catch(() => {});
  }

  return json({ ok: true });
});
