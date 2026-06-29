import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { sendEmail } from "@/lib/email";
import { publicOrigin } from "@/lib/url";

// Where hidden error reports are sent.
const REPORT_EMAIL = "krcriso@gmail.com";

// POST /api/publications/:id/report — send a publishing error to the admins:
// an in-app notification for every admin account + a hidden email, including
// the error text and the full URL of the failure screenshot.
export const POST = route(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await params;

    const pub = await prisma.publication.findFirst({
      where: { id, listing: { userId: user.id } },
      include: {
        portal: true,
        listing: { select: { id: true, title: true } },
      },
    });
    if (!pub) throw new HttpError(404, "Publikácia nenájdená");

    // The failure screenshot is logged with meta.debugScreenshot.
    const logs = await prisma.activityLog.findMany({
      where: { listingId: pub.listing.id, portalKey: pub.portal.key },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    const shotLog = logs.find((l) => {
      const m = l.meta as Record<string, unknown> | null;
      return m && typeof m === "object" && m.debugScreenshot;
    });
    const origin = publicOrigin(req);
    const shotPath = shotLog
      ? String((shotLog.meta as Record<string, unknown>).debugScreenshot)
      : null;
    const shotUrl = shotPath ? `${origin}${shotPath}` : null;

    const body =
      `Chyba pri publikovaní na ${pub.portal.name}\n\n` +
      `Inzerát: ${pub.listing.title}\n` +
      `Odkaz na inzerát: ${origin}/listings/${pub.listing.id}\n` +
      `Používateľ: ${user.email}\n` +
      `Chyba: ${pub.lastError ?? "—"}\n` +
      `Screenshot chyby: ${shotUrl ?? "(nie je k dispozícii)"}\n` +
      `Čas: ${new Date().toLocaleString("sk-SK")}`;

    // In-app notification for every admin account.
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "SYSTEM" as const,
          title: `Chyba pri publikovaní (${pub.portal.name})`,
          body,
        })),
      });
    }

    // Hidden email to the maintainer (no-op if SMTP isn't configured).
    const emailed = await sendEmail({
      to: REPORT_EMAIL,
      subject: `Klikado – chyba pri publikovaní (${pub.portal.name})`,
      text: body,
    });

    return json({ ok: true, emailed });
  },
);
