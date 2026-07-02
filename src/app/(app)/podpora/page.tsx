import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  SupportThreads,
  type SupportThreadDTO,
} from "@/components/SupportThreads";
import { AdminIncidents } from "@/components/AdminIncidents";
import { loadIncidents } from "@/lib/incidents";

// Support / feedback inbox. Users see their own threads + a form to open a new
// one; the admin sees ALL threads and can reply. Opening the page clears the
// "unread" flag for the viewing side (which drives the nav badge).
export default async function SupportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isAdmin = session.user.role === "ADMIN";

  const threads = await prisma.supportThread.findMany({
    where: isAdmin ? {} : { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { email: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  // Mark the viewer's side as read now that they've opened the inbox.
  await prisma.supportThread.updateMany({
    where: isAdmin
      ? { adminUnread: true }
      : { userId: session.user.id, userUnread: true },
    data: isAdmin ? { adminUnread: false } : { userUnread: false },
  });

  // For admin tickets linked to a listing, look up the current portal status so
  // the admin can verify a fix worked right inside the ticket.
  const statusByThread = new Map<string, string>();
  const titleByListing = new Map<string, string>();
  if (isAdmin) {
    const linked = threads.filter((t) => t.listingId);
    const listingIds = [...new Set(linked.map((t) => t.listingId!))];
    if (listingIds.length) {
      const [listings, pubs] = await Promise.all([
        prisma.listing.findMany({
          where: { id: { in: listingIds } },
          select: { id: true, title: true },
        }),
        prisma.publication.findMany({
          where: { listingId: { in: listingIds } },
          select: { listingId: true, status: true, portal: { select: { key: true } } },
        }),
      ]);
      for (const l of listings) titleByListing.set(l.id, l.title);
      for (const t of linked) {
        const p = pubs.find(
          (p) => p.listingId === t.listingId && p.portal.key === t.portalKey,
        );
        if (p) statusByThread.set(t.id, p.status);
      }
    }
  }

  // Admin also handles auto-captured publishing errors here — one place for all
  // support work.
  const incidents = isAdmin ? await loadIncidents() : [];

  const dto: SupportThreadDTO[] = threads.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    userEmail: t.user.email,
    listingId: t.listingId ?? undefined,
    portalKey: t.portalKey ?? undefined,
    listingTitle: t.listingId ? titleByListing.get(t.listingId) : undefined,
    portalStatus: statusByThread.get(t.id),
    createdAt: t.createdAt.toISOString(),
    messages: t.messages.map((m) => ({
      id: m.id,
      author: m.author,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Podpora</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Podnety a nahlásené chyby od používateľov. Odpovede im prídu do účtu aj na e-mail."
            : "Napíš nám podnet, otázku alebo nahlás chybu. Odpoveď ti príde sem aj na e-mail."}
        </p>
      </div>
      {isAdmin && incidents.length > 0 && (
        <details className="group overflow-hidden rounded-xl border bg-card">
          <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2 font-semibold">
              Automaticky zachytené chyby
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                {incidents.length}
              </span>
            </span>
            <span className="text-sm text-muted-foreground group-open:hidden">
              rozbaliť ▾
            </span>
            <span className="hidden text-sm text-muted-foreground group-open:inline">
              zbaliť ▴
            </span>
          </summary>
          <div className="border-t p-4">
            <p className="mb-3 text-sm text-muted-foreground">
              Zlyhania zachytené automaticky — zákazník ich nemusí nahlásiť. Po
              oprave spusti „Publikovať znova" a over stav, prípadne napíš
              zákazníkovi.
            </p>
            <AdminIncidents incidents={incidents} />
          </div>
        </details>
      )}

      <SupportThreads threads={dto} isAdmin={isAdmin} />
    </div>
  );
}
