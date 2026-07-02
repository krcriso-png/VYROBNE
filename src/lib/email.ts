import nodemailer from "nodemailer";

// ===========================================================================
// Transactional email (SMTP via nodemailer).
//
// Used for admin error reports (and later: verification / notifications).
// If SMTP isn't configured the call is a no-op that returns false, so the app
// keeps working — the in-app admin notification is the always-available channel.
// ===========================================================================

const FROM = process.env.EMAIL_FROM ?? "Klikado <noreply@klikado.app>";

function transporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    // Fail fast instead of hanging the request when the SMTP host/port is wrong
    // or unreachable (otherwise a bad config blocks the caller indefinitely).
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const t = transporter();
  if (!t) {
    // eslint-disable-next-line no-console
    console.log(`[email] SMTP not configured — skipping mail to ${opts.to}`);
    return false;
  }
  try {
    await t.sendMail({ from: FROM, ...opts });
    // eslint-disable-next-line no-console
    console.log(`[email] sent to ${opts.to} ("${opts.subject}")`);
    return true;
  } catch (err) {
    const e = err as { code?: string; command?: string; message?: string };
    // eslint-disable-next-line no-console
    console.error(
      `[email] send FAILED to ${opts.to}: ${e.code ?? ""} ${e.command ?? ""} ${
        e.message ?? String(err)
      }`,
    );
    return false;
  }
}
