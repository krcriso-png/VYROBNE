import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, json, requireAdmin, HttpError } from "@/lib/api";
import { notifyUser } from "@/lib/notify";

const bodySchema = z.object({
  blocked: z.boolean(),
  reason: z.string().trim().max(2000).optional(),
});

// POST /api/admin/users/:id/block — admin blocks or unblocks a customer's
// account. A blocked account can no longer log in or perform any action; the
// user is always e-mailed about the change (with the admin's reason).
export const POST = route(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await params;
    const { blocked, reason } = bodySchema.parse(await req.json());

    if (id === admin.id) {
      throw new HttpError(400, "Nemôžeš zablokovať vlastný účet.");
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, blocked: true, email: true },
    });
    if (!user) throw new HttpError(404, "Používateľ nenájdený");
    if (user.role === "ADMIN") {
      throw new HttpError(400, "Administrátorský účet nie je možné zablokovať.");
    }

    // No-op if already in the requested state (don't send a duplicate e-mail).
    if (user.blocked === blocked) {
      return json({ ok: true, blocked });
    }

    await prisma.user.update({ where: { id }, data: { blocked } });

    const reasonLine = reason ? `\n\nDôvod: ${reason}` : "";
    if (blocked) {
      await notifyUser(id, {
        title: "Váš účet na Klikado bol zablokovaný",
        body:
          "Váš účet bol zablokovaný administrátorom. Kým je zablokovaný, " +
          "nie je možné sa prihlásiť ani používať Klikado." +
          reasonLine +
          "\n\nAk si myslíš, že ide o omyl, odpovedz na tento e-mail.",
      });
    } else {
      await notifyUser(id, {
        title: "Váš účet na Klikado bol znovu aktivovaný",
        body:
          "Váš účet bol odblokovaný a znovu funguje v plnom rozsahu. " +
          "Môžeš sa opäť prihlásiť a používať Klikado." +
          reasonLine,
      });
    }

    return json({ ok: true, blocked });
  },
);
