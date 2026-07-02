// ===========================================================================
// Operator / legal details — single source of truth for the legal pages,
// the footer and the cookie bar. Fill in the real company data below; every
// legal document reads from here, so you only edit it in ONE place.
//
// ⚠️ The legal texts (VOP, GDPR, cookies) are solid Slovak-law-aligned
// templates, but have them checked by a lawyer before relying on them.
// ===========================================================================

export const OPERATOR = {
  // Brand / product name shown in the UI.
  brand: "Klikado",
  // Public service URL.
  site: "https://klikado.sk",

  // --- Fill these with your REAL registered details ------------------------
  // Business name exactly as registered (e.g. "Ján Novák" for a živnosť or
  // "Klikado s. r. o." for a company).
  legalName: "KBR Trade s. r. o.",
  // "živnosť" | "s.r.o." — drives which register line is shown.
  form: "s.r.o." as "živnosť" | "s.r.o.",
  // Registered seat / place of business.
  address: "Babkov 234, 013 11 Lietavská Svinná-Babkov",
  ico: "56566808",
  dic: "2122344642",
  // VAT id, or leave the "not a VAT payer" note.
  icDph: "SK2122344642",
  vatNote: "Nie sme platcami DPH.",
  // Registration line: for a živnosť the trade-register office + number, for an
  // s.r.o. the commercial-register court + section/insert.
  registration:
    "Spoločnosť zapísaná v Obchodnom registri Okresného súdu Žilina, oddiel: Sro, vložka č. 86046/L",
  // Statutory representative (konateľ).
  representative: "Bc. Richard Krč, konateľ",

  // --- Contact -------------------------------------------------------------
  email: "info@klikado.sk",
  // Optional — leave "" to omit; set to add a phone to the legal pages.
  phone: "",

  // Date the documents were last updated (shown on each page).
  updated: "2. 7. 2026",
} as const;

// Slovak supervisory authorities referenced in the documents.
export const AUTHORITIES = {
  // Consumer protection.
  soi: "Slovenská obchodná inšpekcia (SOI), Inšpektorát SOI pre príslušný kraj podľa sídla prevádzkovateľa, https://www.soi.sk",
  // Data protection.
  uoou:
    "Úrad na ochranu osobných údajov Slovenskej republiky, Hraničná 12, 820 07 Bratislava, https://dataprotection.gov.sk",
  // Online dispute resolution (EU).
  odr: "https://ec.europa.eu/consumers/odr",
} as const;
