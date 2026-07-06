// ===========================================================================
// Currency conversion — EUR → CZK
//
// Bazoš CZ prices are in Czech crowns, but Klikado listings are in EUR. When
// publishing to a Czech portal we must convert the price with a real exchange
// rate — otherwise "100" (meant as €100) would post as 100 Kč (~€4), which is
// nonsense. We use the Czech National Bank's official daily fixing, cached for
// half a day, with a conservative fallback so a network hiccup never blocks a
// publish. The conversion is always logged so the seller can see the rate used.
// ===========================================================================

// Czech National Bank daily fixing (authoritative for CZK). Plain-text table:
//   "…\nEMU|euro|1|EUR|25.230\n…"
const CNB_URL =
  "https://www.cnb.cz/en/financial-markets/foreign-exchange-market/central-bank-exchange-rate-fixing/central-bank-exchange-rate-fixing/daily.txt";

// Used only if the live rate can't be fetched. Kept intentionally close to the
// long-run EUR/CZK level; a publish is never blocked on a missing rate.
const FALLBACK_EUR_CZK = 25;

let cache: { rate: number; at: number } | null = null;
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/** Current EUR→CZK rate (how many CZK for 1 EUR). Live, cached, with fallback. */
export async function eurCzkRate(): Promise<{ rate: number; live: boolean }> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { rate: cache.rate, live: true };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(CNB_URL, { signal: ctrl.signal });
    clearTimeout(t);
    const text = await res.text();
    // Find the EUR row: Country|Currency|Amount|Code|Rate
    const line = text.split("\n").find((l) => /\|EUR\|/.test(l));
    if (line) {
      const parts = line.split("|");
      const amount = parseInt(parts[2], 10) || 1;
      const rate = parseFloat(parts[4].replace(",", "."));
      if (rate > 0) {
        const perEur = rate / amount;
        cache = { rate: perEur, at: Date.now() };
        return { rate: perEur, live: true };
      }
    }
  } catch {
    // fall through to the fallback rate
  }
  return { rate: FALLBACK_EUR_CZK, live: false };
}

/**
 * Convert an EUR amount to whole Czech crowns using the current rate.
 * Returns the crown amount plus a human note describing the conversion.
 */
export async function eurToCzk(
  amountEur: number,
): Promise<{ czk: number; rate: number; live: boolean; note: string }> {
  const { rate, live } = await eurCzkRate();
  const czk = Math.round(amountEur * rate);
  const note =
    `Cena prepočítaná z ${amountEur} € na ${czk} Kč ` +
    `kurzom ${rate.toFixed(2)} Kč/€${live ? "" : " (záložný kurz)"}.`;
  return { czk, rate, live, note };
}
