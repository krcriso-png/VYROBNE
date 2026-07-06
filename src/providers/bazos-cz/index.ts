import { BazosSkProvider } from "../bazos-sk";
import type { ProviderContext } from "../types";
import { eurToCzk } from "../../lib/fx";

// ===========================================================================
// Bazoš CZ
//
// The Czech Bazoš is functionally identical to the Slovak one — same engine,
// different domain. We reuse the entire SK flow and only swap the base URL,
// which neatly demonstrates how related portals share an implementation.
// ===========================================================================

export class BazosCzProvider extends BazosSkProvider {
  readonly key = "bazos-cz";
  readonly name = "Bazoš CZ";
  readonly country = "CZ";

  protected baseUrl = "https://www.bazos.cz";
  // Keep the whole flow on bazos.cz (section subdomains, ad links) instead of
  // leaking back to bazos.sk.
  protected domain = "bazos.cz";
  // Bazoš CZ accepts international numbers; Slovak sellers use +421.
  protected phonePrefix = "+421";
  // Bazoš CZ uses the dedicated PSČ 98765 for Slovak ads — always send that on
  // the Czech site (a real Slovak postcode like "01001" is rejected).
  protected fallbackZip = "98765";

  // The Czech site uses Czech-spelled section subdomains; map the Slovak keys
  // (stored from the category picker) to their Czech equivalents. Keys not
  // listed here are identical on both sites (auto, reality, pc, deti, …).
  private static readonly KEY_MAP: Record<string, string> = {
    praca: "prace",
    zvierata: "zvirata",
    dom: "dum",
    nabytok: "nabytek",
    oblecenie: "obleceni",
    ostatne: "ostatni",
    vstupenky: "listky",
  };

  protected mapSectionKey(key: string): string {
    return BazosCzProvider.KEY_MAP[key] ?? key;
  }

  // Klikado prices are in EUR; the Czech field expects crowns. Convert with a
  // real (Czech National Bank) rate and log it transparently, so €100 posts as
  // ~2530 Kč instead of "100 Kč". Never blocks a publish — see src/lib/fx.ts.
  protected async priceForPortal(
    priceEur: number,
    ctx: ProviderContext,
  ): Promise<string> {
    const { czk, note } = await eurToCzk(priceEur);
    await ctx.log(note);
    return String(czk);
  }

  // Bazoš CZ "Moje inzeráty" lists by the phone in "421…" form (no leading 0).
  protected myAdsPhonePrefix = "421";
}
