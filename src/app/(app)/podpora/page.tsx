import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  SupportThreads,
  type SupportThreadDTO,
} from "@/components/SupportThreads";

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

  const dto: SupportThreadDTO[] = threads.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    userEmail: t.user.email,
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
      <SupportThreads threads={dto} isAdmin={isAdmin} />
    </div>
  );
}
