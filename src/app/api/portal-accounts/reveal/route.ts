import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { decrypt } from "@/lib/crypto";

// POST /api/portal-accounts/reveal { portalKey } — return the caller's OWN saved
// portal password in clear text. Explicit, per-request action (never part of the
// bulk portals list) so the secret is only sent when the user asks to see it.
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const { portalKey } = (await req.json().catch(() => ({}))) as {
    portalKey?: string;
  };
  if (!portalKey) throw new HttpError(400, "Chýba portál");

  const portal = await prisma.portal.findUnique({ where: { key: portalKey } });
  if (!portal) throw new HttpError(404, "Portál neexistuje");

  const account = await prisma.portalAccount.findUnique({
    where: { userId_portalId: { userId: user.id, portalId: portal.id } },
    select: { passwordEnc: true },
  });
  if (!account?.passwordEnc) return json({ password: "" });

  let password = "";
  try {
    password = decrypt(account.passwordEnc) ?? "";
  } catch {
    throw new HttpError(500, "Heslo sa nepodarilo dešifrovať.");
  }
  return json({ password });
});
