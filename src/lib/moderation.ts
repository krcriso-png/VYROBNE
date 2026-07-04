// ===========================================================================
// Content moderation — heuristic scanner for forbidden listings.
//
// A deterministic keyword scanner that FLAGS listings likely to break the
// portals' rules (and the law): sexual services, drugs, prescription meds,
// weapons, counterfeits. It is intentionally a *review aid*, not a verdict —
// keyword matches can be false positives, so flagged ads are surfaced to the
// admin to decide, never auto-deleted. This keeps Klikado truthful: we say
// "podozrivé, skontroluj", not "toto je zakázané".
//
// No external service is used: matching is local, diacritics-insensitive and
// word-boundary aware to keep false positives low.
// ===========================================================================

export type ModerationCategory =
  | "sexual"
  | "drugs"
  | "medicine"
  | "weapons"
  | "counterfeit";

export type ModerationSeverity = "high" | "medium";

export interface ModerationFlag {
  category: ModerationCategory;
  /** Human label (Slovak) for the admin UI. */
  label: string;
  severity: ModerationSeverity;
  /** Which terms actually matched — shown so the admin sees *why*. */
  terms: string[];
}

interface Rule {
  category: ModerationCategory;
  label: string;
  severity: ModerationSeverity;
  terms: string[];
}

// Terms are matched diacritics-insensitively. Single words match on word
// boundaries (so "sex" won't hit "sexy oblečenie"→ actually it would; those
// borderline words are kept at medium severity). Multi-word terms match as a
// phrase substring.
const RULES: Rule[] = [
  {
    category: "sexual",
    label: "Sexuálne služby",
    severity: "high",
    terms: [
      "escort", "eskort", "eroticka masaz", "erotická masáž", "eroticke sluzby",
      "erotické služby", "sexualne sluzby", "sexuálne služby", "sex sluzby",
      "intimne sluzby", "intímne služby", "prostitutka", "prostitútka",
      "spolocnicka na noc", "gigolo", "webcam sex", "sexchat", "privat na hodinu",
      "privát na hodinu", "hodinovy hotel", "hodinový hotel", "predam sex",
      "predám sex", "ponukam sex", "ponúkam sex", "sex za peniaze",
    ],
  },
  {
    category: "drugs",
    label: "Drogy",
    severity: "high",
    terms: [
      "marihuana", "marijuana", "weed", "ganja", "hasis", "hašiš", "hashish",
      "kokain", "kokaín", "cocaine", "pervitin", "pervitín", "metamfetamin",
      "metamfetamín", "extaza", "extáza", "extasy", "ecstasy", "mdma", "lsd",
      "heroin", "heroín", "amfetamin", "amfetamín", "psilocybin", "psilocybín",
      "lysohlavky", "predam drogy", "predám drogy", "predaj drog",
    ],
  },
  {
    category: "medicine",
    label: "Lieky / doping",
    severity: "high",
    terms: [
      "viagra", "kamagra", "cialis", "levitra", "anaboliky", "anabolika",
      "steroidy", "testosteron", "testosterón", "xanax", "rivotril", "diazepam",
      "tramadol", "subutex", "suboxone", "lieky na predpis", "lieky bez predpisu",
      "predam lieky", "predám lieky", "antibiotika", "antibiotiká", "inzulin",
      "inzulín",
    ],
  },
  {
    category: "weapons",
    label: "Zbrane / strelivo",
    severity: "medium",
    terms: [
      "samopal", "kalasnikov", "kalašnikov", "glock", "naboje", "náboje",
      "strelivo", "granat", "granát", "vybusnina", "výbušnina", "pistol bez",
      "zbran bez", "zbraň bez", "nelegalna zbran", "nelegálna zbraň",
    ],
  },
  {
    category: "counterfeit",
    label: "Napodobeniny / fejky",
    severity: "medium",
    terms: [
      "replika", "repliky", "napodobenina", "napodobeniny", "fake znacky",
      "fake značky", "1:1 kopia", "1:1 kópia", "kopia znacky", "kópia značky",
    ],
  },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (combining marks)
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Scan a listing's text and return every forbidden-content flag it matches. */
export function scanListing(input: {
  title?: string | null;
  description?: string | null;
  category?: string | null;
}): ModerationFlag[] {
  const hay = normalize(
    [input.title, input.description, input.category].filter(Boolean).join("  "),
  );
  if (!hay) return [];

  const flags: ModerationFlag[] = [];
  for (const rule of RULES) {
    // Dedupe matches by normalized form (so "kokain"/"kokaín" show once),
    // preferring the nicer diacritic spelling.
    const byNorm = new Map<string, string>();
    for (const term of rule.terms) {
      const nt = normalize(term);
      if (!nt) continue;
      const hit = nt.includes(" ")
        ? hay.includes(nt) // phrase
        : new RegExp(`(^|[^a-z0-9])${escapeRe(nt)}([^a-z0-9]|$)`).test(hay);
      if (!hit) continue;
      const existing = byNorm.get(nt);
      // Keep a term with diacritics over its plain-ASCII twin.
      if (!existing || (existing === normalize(existing) && term !== nt)) {
        byNorm.set(nt, term);
      }
    }
    const matched = [...byNorm.values()];
    if (matched.length) {
      flags.push({
        category: rule.category,
        label: rule.label,
        severity: rule.severity,
        terms: matched,
      });
    }
  }
  return flags;
}

/** Highest severity across the flags, or null if clean. */
export function worstSeverity(
  flags: ModerationFlag[],
): ModerationSeverity | null {
  if (flags.some((f) => f.severity === "high")) return "high";
  if (flags.length) return "medium";
  return null;
}
