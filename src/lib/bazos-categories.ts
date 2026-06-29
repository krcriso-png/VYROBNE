// ===========================================================================
// Bazoš.sk category tree
//
// Bazoš organises ads as Section (a subdomain, e.g. deti.bazos.sk) → Subcategory
// (a dropdown / link on the section's add page). We let the user "click through"
// the same two levels in Klikado so the right category is picked instead of free
// text. The chosen section key + subcategory label are stored on the listing
// (listing.parameters.bazosSection / .bazosCategory) and used by the publisher:
//  - the section key routes to https://<key>.bazos.sk/pridat-inzerat.php
//  - the subcategory label is matched against the real on-page options.
//
// Labels mirror the live site closely; exact wording is not critical because the
// publisher matches by word overlap against the actual page options.
// ===========================================================================

export interface BazosSection {
  key: string;
  label: string;
  subcategories: string[];
}

export const BAZOS_CATEGORIES: BazosSection[] = [
  {
    key: "auto",
    label: "Autá",
    subcategories: [
      "Osobné autá",
      "Úžitkové vozidlá",
      "Nákladné vozidlá",
      "Autobusy",
      "Prívesy a návesy",
      "Náhradné diely",
      "Pneumatiky a disky",
      "Veteráni",
      "Ostatné",
    ],
  },
  {
    key: "motorky",
    label: "Motorky",
    subcategories: [
      "Motocykle",
      "Skútre",
      "Štvorkolky",
      "Náhradné diely",
      "Oblečenie a prilby",
      "Ostatné",
    ],
  },
  {
    key: "reality",
    label: "Reality",
    subcategories: [
      "Predaj bytu",
      "Prenájom bytu",
      "Predaj domu",
      "Prenájom domu",
      "Pozemky",
      "Chaty a chalupy",
      "Kancelárie a obchodné priestory",
      "Garáže",
      "Ostatné",
    ],
  },
  {
    key: "praca",
    label: "Práca",
    subcategories: [
      "Ponuka práce",
      "Hľadám prácu",
      "Brigády",
      "Práca v zahraničí",
      "Ostatné",
    ],
  },
  {
    key: "zvierata",
    label: "Zvieratá",
    subcategories: [
      "Psy",
      "Mačky",
      "Vtáky",
      "Akvaristika a ryby",
      "Hlodavce",
      "Kone",
      "Hospodárske zvieratá",
      "Krmivá a chovateľské potreby",
      "Ostatné",
    ],
  },
  {
    key: "deti",
    label: "Detský bazár",
    subcategories: [
      "Kočíky",
      "Autosedačky",
      "Detské oblečenie",
      "Detská obuv",
      "Hračky",
      "Detský nábytok",
      "Postieľky",
      "Kojenecké potreby",
      "Tehotenské potreby",
      "Ostatné",
    ],
  },
  {
    key: "dom",
    label: "Dom a záhrada",
    subcategories: [
      "Záhrada",
      "Náradie",
      "Stavebný materiál",
      "Kúrenie",
      "Kúpeľne a WC",
      "Dvere a okná",
      "Bazény",
      "Dekorácie",
      "Ostatné",
    ],
  },
  {
    key: "pc",
    label: "PC",
    subcategories: [
      "Notebooky",
      "Počítače",
      "Monitory",
      "Komponenty",
      "Tlačiarne",
      "Siete a Wi-Fi",
      "Softvér",
      "Príslušenstvo",
      "Ostatné",
    ],
  },
  {
    key: "mobil",
    label: "Mobily",
    subcategories: [
      "Mobilné telefóny",
      "Smart hodinky",
      "Tablety",
      "Príslušenstvo",
      "Náhradné diely",
      "Ostatné",
    ],
  },
  {
    key: "foto",
    label: "Foto",
    subcategories: [
      "Fotoaparáty",
      "Objektívy",
      "Videokamery",
      "Statívy",
      "Príslušenstvo",
      "Ostatné",
    ],
  },
  {
    key: "elektro",
    label: "Elektro",
    subcategories: [
      "Televízory",
      "Práčky",
      "Chladničky",
      "Kuchynské spotrebiče",
      "Audio a Hi-Fi",
      "Herné konzoly",
      "Malé spotrebiče",
      "Ostatné",
    ],
  },
  {
    key: "stroje",
    label: "Stroje",
    subcategories: [
      "Poľnohospodárske stroje",
      "Stavebné stroje",
      "Dielenské stroje",
      "Náhradné diely",
      "Ostatné",
    ],
  },
  {
    key: "sport",
    label: "Šport",
    subcategories: [
      "Bicykle",
      "Lyže a snowboardy",
      "Fitness a posilňovanie",
      "Turistika a kemping",
      "Vodné športy",
      "Loptové športy",
      "Ostatné",
    ],
  },
  {
    key: "hudba",
    label: "Hudba",
    subcategories: [
      "Hudobné nástroje",
      "Gitary",
      "Klávesy a piána",
      "Bicie",
      "Zvuková technika",
      "Ostatné",
    ],
  },
  {
    key: "knihy",
    label: "Knihy",
    subcategories: [
      "Beletria",
      "Učebnice",
      "Detské knihy",
      "Časopisy",
      "Ostatné",
    ],
  },
  {
    key: "nabytok",
    label: "Nábytok",
    subcategories: [
      "Sedačky a kreslá",
      "Stoly a stoličky",
      "Skrine",
      "Postele",
      "Kuchyne",
      "Detský nábytok",
      "Ostatné",
    ],
  },
  {
    key: "oblecenie",
    label: "Oblečenie",
    subcategories: [
      "Dámske oblečenie",
      "Pánske oblečenie",
      "Obuv",
      "Šperky a hodinky",
      "Doplnky a kabelky",
      "Svadobné",
      "Ostatné",
    ],
  },
  {
    key: "sluzby",
    label: "Služby",
    subcategories: [
      "Remeselné práce",
      "Doprava a sťahovanie",
      "Kurzy a vzdelávanie",
      "IT a web",
      "Krása a zdravie",
      "Ostatné",
    ],
  },
  {
    key: "vstupenky",
    label: "Lístky",
    subcategories: ["Koncerty", "Šport", "Divadlo", "Festivaly", "Ostatné"],
  },
  {
    key: "ostatne",
    label: "Ostatné",
    subcategories: ["Zberateľstvo", "Starožitnosti", "Darujem", "Ostatné"],
  },
];

/** Build a human-readable "Sekcia / Podkategória" string for display. */
export function bazosCategoryLabel(
  sectionKey?: string | null,
  subcategory?: string | null,
): string {
  const section = BAZOS_CATEGORIES.find((s) => s.key === sectionKey);
  if (!section) return subcategory || "";
  return subcategory ? `${section.label} / ${subcategory}` : section.label;
}
