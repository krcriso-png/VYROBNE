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

  // The portal EXPLICITLY says the number is blocked → we know the reason; say
  // it plainly (no "nevidíme dôvod").
  if (/blokuje toto telef|zablokovan\w*\s+(telef|[čc][íi]sl)/.test(e)) {
    return {
      kind: "user",
      message:
        "Portál blokuje toto telefónne číslo pri SMS overení. Použi iné " +
        "telefónne číslo na overenie, alebo v sekcii Portály pripoj účet portálu " +
        "(e-mail + heslo) — vtedy sa SMS pri pridávaní zvyčajne nežiada.",
    };
  }
  if (
    /prekročili|překročili|maximum kód|sms limit|odmietol sms|skúste to neskôr|zkuste to (pozd|později)/.test(
      e,
    )
  ) {
    return {
      kind: "user",
      message:
        "Portál odmietol SMS overenie na toto telefónne číslo — pravdepodobne " +
        "dočasný limit (priveľa pokusov za sebou). Riešenie: pripoj účet portálu " +
        "(e-mail + heslo) v sekcii Portály — vtedy sa SMS pri pridávaní zvyčajne " +
        "nežiada; alebo skús iné číslo na overenie, prípadne to skús neskôr.",
    };
  }
  if (
    /nepovolen\w*[^.]*znak|nem[ôo][žz]ete prida|špeci[áa]lne znak|zak[áa]zan\w*\s+znak|emoji/.test(
      e,
    )
  ) {
    return {
      kind: "user",
      message:
        "Portál zamietol inzerát — text (názov alebo popis) obsahuje nepovolené znaky, napríklad emoji (✅, 🙂 …). Odstráň emoji a špeciálne znaky z názvu a popisu a skús znova.",
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
      "Publikovanie zlyhalo z nejasného dôvodu. Skús to znova o chvíľu — ak to " +
      "pretrváva, nahlás nám to tlačidlom nižšie a pozrieme sa na to.",
  };
}
