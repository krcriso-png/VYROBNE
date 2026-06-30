import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { notifyAdmins } from "@/lib/notify";
import { publicOrigin } from "@/lib/url";

// POST /api/publications/:id/report — turn a publishing error into a support
// thread the admin can reply to (the reply reaches the user in-app + by
// e-mail), and notify the admins (in-app + e-mail) with the error details and
// the failure-screenshot URL.
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

    const subject = `Chyba pri publikovaní (${pub.portal.name})`;

    // Create a support thread so the admin can reply and the user sees it. The
    // listing/portal link lets the admin re-publish / re-check for this customer
    // straight from the ticket after a fix.
    await prisma.supportThread.create({
      data: {
        userId: user.id,
        subject,
        listingId: pub.listing.id,
        portalKey: pub.portal.key,
        adminUnread: true,
        userUnread: false,
        messages: { create: { author: "USER", body } },
      },
    });

    // Notify the admins (in-app + e-mail).
    await notifyAdmins({
      title: subject,
      body: `${body}\n\nOdpovedz v Klikade: ${origin}/podpora`,
    });

    return json({ ok: true });
  },
);
