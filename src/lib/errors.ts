// ===========================================================================
// User-facing error classification
//
// Maps a raw error message (from a provider/worker) into a short, plain-language
// message and whether the user can fix it themselves ("user") or it's a
// technical problem on our side ("system" → offer to report it to the admin).
// Pure module — safe to import on the client.
// ===========================================================================

export type ErrorKind = "user" | "system";

export interface FriendlyError {
  kind: ErrorKind;
  message: string;
}

export function classifyError(raw: string | null | undefined): FriendlyError {
  const e = (raw ?? "").toLowerCase();
  if (!e) return { kind: "system", message: "Neznáma chyba." };

  if (/zablokoval|maximum kódov|skúste to neskôr/.test(e)) {
    return {
      kind: "user",
      message:
        "Portál dočasne zablokoval SMS overenie na tvoje číslo (priveľa pokusov). Skús to o pár hodín.",
    };
  }
  if (/nie je zadané žiadne číslo|nemá telefónne|vyžaduje overenie telefón/.test(e)) {
    return {
      kind: "user",
      message:
        "Chýba telefónne číslo na overenie. Doplň ho pri portáli (Telefón na SMS overenie) alebo v inzeráte.",
    };
  }
  if (/kód nebol zadan/.test(e)) {
    return {
      kind: "user",
      message:
        "SMS kód nebol zadaný včas. Skús publikovať znova a zadaj kód hneď, ako príde.",
    };
  }
  if (/žiadny účet|no portal account|chýba.*účet|account linked/.test(e)) {
    return {
      kind: "user",
      message: "Chýba pripojený účet portálu. Pridaj ho v sekcii Portály.",
    };
  }
  if (/povinné pole|nepotvrdil zverejnenie|vyplň|required/.test(e)) {
    return {
      kind: "user",
      message:
        "Inzerát sa nepodarilo dokončiť — pravdepodobne chýba povinný údaj (názov, kategória, cena, meno alebo kontakt). Skontroluj inzerát a skús znova.",
    };
  }
  if (/limit.*inzerát|active listing/.test(e)) {
    return {
      kind: "user",
      message:
        "Dosiahol si limit aktívnych inzerátov pre tvoj plán. Archivuj nejaký inzerát alebo si zmeň plán.",
    };
  }

  return {
    kind: "system",
    message:
      "Nastala technická chyba na našej strane. Skús to znova o chvíľu — alebo to nahlás adminovi tlačidlom nižšie.",
  };
}
