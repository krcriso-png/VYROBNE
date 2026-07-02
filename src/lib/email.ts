import nodemailer from "nodemailer";

// ===========================================================================
// Transactional email (SMTP via nodemailer).
//
// Used for admin error reports (and later: verification / notifications).
// If SMTP isn't configured the call is a no-op that returns false, so the app
// keeps working — the in-app admin notification is the always-available channel.
// ===========================================================================

const FROM = process.env.EMAIL_FROM ?? "Klikado <noreply@klikado.app>";
const BRAND = "#4f46e5"; // Klikado indigo
const SITE = (process.env.AUTH_URL ?? "https://klikado.sk").replace(/\/$/, "");

/**
 * Wrap content in a clean, branded, email-client-safe HTML shell (logo,
 * optional call-to-action button, footer). Inline styles + tables for maximum
 * client compatibility.
 */
export function renderBrandedEmail(opts: {
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  footerNote?: string;
}): string {
  const body = opts.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151">${p}</p>`,
    )
    .join("");
  const button = opts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td style="border-radius:10px;background:${BRAND}">
         <a href="${opts.button.url}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${opts.button.label}</a>
       </td></tr></table>`
    : "";
  const footerNote = opts.footerNote
    ? `<p style="margin:0 0 10px;font-size:12px;line-height:1.5;color:#9ca3af">${opts.footerNote}</p>`
    : "";
  return `<!doctype html><html lang="sk"><body style="margin:0;padding:0;background:#f3f4f6">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="padding:24px 28px 8px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:40px;height:40px;background:${BRAND};border-radius:10px;text-align:center;vertical-align:middle;color:#fff;font-size:20px;font-weight:800;font-family:Arial,Helvetica,sans-serif">K</td>
            <td style="padding-left:10px;font-size:20px;font-weight:800;color:#111827;font-family:Arial,Helvetica,sans-serif">Klikado</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:14px 28px 4px">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111827;font-family:Arial,Helvetica,sans-serif">${opts.heading}</h1>
          <div style="font-family:Arial,Helvetica,sans-serif">${body}${button}</div>
        </td></tr>
        <tr><td style="padding:18px 28px 24px;border-top:1px solid #f0f0f3;margin-top:8px">
          ${footerNote}
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;font-family:Arial,Helvetica,sans-serif">
            © ${new Date().getFullYear()} Klikado ·
            <a href="${SITE}" style="color:${BRAND};text-decoration:none">klikado.sk</a><br/>
            Jeden inzerát, všetky portály.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

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

/**
 * Send via Resend's HTTP API. Works where outbound SMTP is blocked (e.g.
 * Railway blocks ports 465/587), because it goes over HTTPS (443).
 */
async function sendViaResend(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      // eslint-disable-next-line no-console
      console.log(`[email] sent via Resend to ${opts.to} ("${opts.subject}")`);
      return true;
    }
    const body = await res.text().catch(() => "");
    // eslint-disable-next-line no-console
    console.error(`[email] Resend FAILED (${res.status}) to ${opts.to}: ${body}`);
    return false;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[email] Resend error to ${opts.to}:`, err);
    return false;
  }
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  // Prefer the HTTP API (bypasses cloud SMTP blocks). Fall back to SMTP.
  if (process.env.RESEND_API_KEY) return sendViaResend(opts);

  const t = transporter();
  if (!t) {
    // eslint-disable-next-line no-console
    console.log(`[email] no email provider configured — skipping mail to ${opts.to}`);
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
