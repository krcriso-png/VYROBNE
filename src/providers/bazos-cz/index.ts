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
}
