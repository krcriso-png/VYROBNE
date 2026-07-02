import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  SupportThreads,
  type SupportThreadDTO,
} from "@/components/SupportThreads";

// Customer support inbox — users see their own threads and can open a new one.
// Admins handle all support in the Admin panel, so they're redirected there.
export default async function SupportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "ADMIN") redirect("/admin");
  const userId = session.user.id;

  const threads = await prisma.supportThread.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { email: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  // Mark the user's side as read now that they've opened the inbox.
  await prisma.supportThread.updateMany({
    where: { userId, userUnread: true },
    data: { userUnread: false },
  });

  const dto: SupportThreadDTO[] = threads.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    userEmail: t.user.email,
    listingId: t.listingId ?? undefined,
    portalKey: t.portalKey ?? undefined,
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
          Napíš nám podnet, otázku alebo nahlás chybu. Odpoveď ti príde sem aj
          na e-mail.
        </p>
      </div>
      <SupportThreads threads={dto} isAdmin={false} />
    </div>
  );
}
