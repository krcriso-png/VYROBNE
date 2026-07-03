import { prisma } from "../lib/db";
import { logActivity } from "../lib/logger";
import { notifyAdmins } from "../lib/notify";
import { getProvider } from "../providers/registry";
import type { ProviderContext } from "../providers/types";

// ===========================================================================
// Portal canary
//
// Periodically opens each enabled portal's add page and confirms its structure
// is intact (via the provider's optional healthCheck), WITHOUT posting anything.
// If a portal changed its form and would break real publishing, the admin is
// e-mailed BEFORE customers hit the failure. Runs inside the worker (which has
// Chromium available).
// ===========================================================================

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== "false";

function canaryCtx(portalKey: string): ProviderContext {
  return {
    headless: HEADLESS,
    log: (message, meta) => logActivity({ message, meta, portalKey }),
  };
}

/** Run healthCheck for every enabled portal that implements it. */
export async function runCanaries(): Promise<void> {
  const portals = await prisma.portal.findMany({ where: { enabled: true } });
  const failures: string[] = [];

  for (const portal of portals) {
    let provider;
    try {
      provider = getProvider(portal.key);
    } catch {
      continue;
    }
    if (typeof provider.healthCheck !== "function") continue;

    try {
      const res = await provider.healthCheck(canaryCtx(portal.key));
      await logActivity({
        level: res.ok ? "INFO" : "WARN",
        message: `Kanárik ${portal.name}: ${res.ok ? "OK ✅" : "ZMENA ⚠️"} — ${res.detail}`,
        portalKey: portal.key,
      });
      if (!res.ok) failures.push(`${portal.name}: ${res.detail}`);
    } catch (err) {
      await logActivity({
        level: "ERROR",
        message: `Kanárik ${portal.name} zlyhal: ${String(err)}`,
        portalKey: portal.key,
      });
      failures.push(`${portal.name}: ${String(err).slice(0, 140)}`);
    }
  }

  if (failures.length > 0) {
    await notifyAdmins({
      title: "⚠️ Kanárik: portál sa možno zmenil",
      body:
        "Automatická kontrola portálov našla problém:\n\n" +
        failures.map((f) => `• ${f}`).join("\n") +
        "\n\nPravdepodobne sa zmenil formulár na portáli — publikovanie pre " +
        "zákazníkov môže byť ohrozené. Skontroluj to prosím.",
      type: "SYSTEM",
      buttonLabel: "Otvoriť Admin",
    }).catch(() => undefined);
  }
}
