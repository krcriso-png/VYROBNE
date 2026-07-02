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
  legalName: "[DOPLŇ: obchodné meno]",
  // "živnosť" | "s.r.o." — drives which register line is shown.
  form: "živnosť" as "živnosť" | "s.r.o.",
  // Registered seat / place of business.
  address: "[DOPLŇ: ulica č., PSČ Mesto]",
  ico: "[DOPLŇ: IČO]",
  dic: "[DOPLŇ: DIČ]",
  // VAT id, or leave the "not a VAT payer" note.
  icDph: "" /* napr. "SK1234567890" */,
  vatNote: "Nie sme platcami DPH.",
  // Registration line: for a živnosť the trade-register office + number, for an
  // s.r.o. the commercial-register court + section/insert.
  registration:
    "[DOPLŇ: napr. Okresný úrad Žilina, číslo živnostenského registra 580-00000]",

  // --- Contact -------------------------------------------------------------
  email: "info@klikado.sk",
  phone: "[DOPLŇ: telefón]",

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
