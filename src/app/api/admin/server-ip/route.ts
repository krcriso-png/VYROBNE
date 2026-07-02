import { route, json, requireAdmin } from "@/lib/api";

// GET /api/admin/server-ip — reveal the app server's public OUTBOUND IP
// (what an external mail server like Websupport sees when we connect). Admin
// only. Handy for asking a host to whitelist our sending IP.
//
// Note: on Railway without a dedicated static egress this IP is not guaranteed
// to be stable, so whitelisting by IP may stop working after a redeploy.
export const GET = route(async () => {
  await requireAdmin();

  const sources = [
    "https://api.ipify.org?format=json", // -> { ip }
    "https://ifconfig.co/json", // -> { ip, ... }
  ];

  let ipv4: string | null = null;
  for (const url of sources) {
    try {
      const res = await fetch(url, {
        // Don't let a slow probe hang the request.
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { ip?: string };
      if (data.ip) {
        ipv4 = data.ip;
        break;
      }
    } catch {
      /* try next source */
    }
  }

  return json({
    ip: ipv4,
    note: ipv4
      ? "Toto je aktuálna odchádzajúca IP servera. Na Railway sa môže časom zmeniť."
      : "IP sa nepodarilo zistiť — skús obnoviť stránku.",
  });
});
