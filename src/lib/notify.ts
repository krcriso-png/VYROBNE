import type { NotificationType } from "@prisma/client";
import { prisma } from "./db";
import { sendEmail } from "./email";

// ===========================================================================
// Notifications — in-app + e-mail.
//
// Every important event reaches the recipient on two channels: an in-app
// Notification row (shown in their account) and a best-effort e-mail (a no-op
// if SMTP isn't configured). Used by the support/feedback threads so both the
// user and the admin always see new messages.
// ===========================================================================

// Real maintainer inbox — the seeded admin account uses a .local address, so we
// also e-mail this real address to be sure reports reach a human.
const MAINTAINER_EMAIL = process.env.ADMIN_EMAIL ?? "krcriso@gmail.com";

interface NotifyOpts {
  title: string;
  body: string;
  type?: NotificationType;
}

/** Notify every admin account (in-app + e-mail), plus the maintainer inbox. */
export async function notifyAdmins(opts: NotifyOpts): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });

  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: opts.type ?? ("SYSTEM" as NotificationType),
        title: opts.title,
        body: opts.body,
      })),
    });
  }

  const recipients = new Set<string>([MAINTAINER_EMAIL]);
  for (const a of admins) if (a.email) recipients.add(a.email);
  for (const to of recipients) {
    await sendEmail({ to, subject: `Klikado – ${opts.title}`, text: opts.body });
  }
}

/** Notify a single user (in-app + e-mail). */
export async function notifyUser(
  userId: string,
  opts: NotifyOpts,
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId,
      type: opts.type ?? ("SYSTEM" as NotificationType),
      title: opts.title,
      body: opts.body,
    },
  });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (user?.email) {
    await sendEmail({
      to: user.email,
      subject: `Klikado – ${opts.title}`,
      text: opts.body,
    });
  }
}
