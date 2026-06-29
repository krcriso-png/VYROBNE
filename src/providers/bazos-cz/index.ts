import { BazosSkProvider } from "../bazos-sk";

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
  // Bazoš CZ rejects a Slovak ad without a 5-digit Czech PSČ, so provide one
  // when the listing has no valid Czech postcode.
  protected fallbackZip = "10000";
}
