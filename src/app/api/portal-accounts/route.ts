import { prisma } from "@/lib/db";
import { route, json, requireUser, HttpError } from "@/lib/api";
import { portalAccountSchema } from "@/lib/validation";
import { encrypt } from "@/lib/crypto";

// GET /api/portal-accounts — list the user's saved portal logins.
// Secrets are NEVER returned; only metadata and a "configured" flag.
export const GET = route(async () => {
  const user = await requireUser();
  const accounts = await prisma.portalAccount.findMany({
    where: { userId: user.id },
    include: { portal: { select: { key: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return json({
    accounts: accounts.map((a) => ({
      id: a.id,
      portalKey: a.portal.key,
      portalName: a.portal.name,
      label: a.label,
      login: a.login,
      verifyPhone: a.verifyPhone,
      hasPassword: !!a.passwordEnc,
      needsReauth: a.needsReauth,
      lastLoginAt: a.lastLoginAt,
    })),
  });
});

// POST /api/portal-accounts — create/update a portal login. The password is
// encrypted (AES-256-GCM) before storage and is never echoed back.
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = portalAccountSchema.parse(await req.json());

  const portal = await prisma.portal.findUnique({
    where: { key: input.portalKey },
  });
  if (!portal) throw new HttpError(404, "Portál neexistuje");

  const account = await prisma.portalAccount.upsert({
    where: { userId_portalId: { userId: user.id, portalId: portal.id } },
    create: {
      userId: user.id,
      portalId: portal.id,
      label: input.label,
      login: input.login,
      verifyPhone: input.verifyPhone,
      passwordEnc: encrypt(input.password),
      // Force a fresh login on next use since credentials changed.
      needsReauth: true,
    },
    update: {
      label: input.label,
      login: input.login,
      verifyPhone: input.verifyPhone,
      ...(input.password ? { passwordEnc: encrypt(input.password) } : {}),
      needsReauth: true,
      sessionEnc: null,
      sessionValidUntil: null,
    },
  });

  return json({ id: account.id }, { status: 201 });
});
