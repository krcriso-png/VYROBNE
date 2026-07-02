import type { Metadata } from "next";
import { OPERATOR } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Zásady používania cookies — Klikado",
  description: "Aké cookies služba Klikado používa a prečo.",
};

export default function CookiesPage() {
  return (
    <>
      <h1>Zásady používania cookies</h1>
      <p className="text-sm text-muted-foreground">
        Účinné od {OPERATOR.updated}
      </p>

      <p>
        Cookies sú malé súbory, ktoré si prehliadač ukladá pri návšteve webu.
        Služba {OPERATOR.brand} používa iba <strong>nevyhnutné</strong> cookies
        potrebné na jej fungovanie — nepoužívame reklamné ani sledovacie cookies
        tretích strán.
      </p>

      <h2>Aké cookies používame</h2>
      <ul>
        <li>
          <strong>Prihlásenie (session):</strong> udržiava tvoje prihlásenie do
          účtu. Bez neho by si sa nevedel prihlásiť.
        </li>
        <li>
          <strong>Bezpečnosť:</strong> ochrana pred zneužitím prihlasovacieho a
          formulárového procesu.
        </li>
        <li>
          <strong>Voľba cookies:</strong> zapamätá si, že si už videl túto lištu
          (aby sa nezobrazovala opakovane).
        </li>
      </ul>
      <p>
        Tieto cookies sú <strong>nevyhnutné</strong> a nevyžadujú súhlas podľa
        zákona č. 452/2021 Z. z. o elektronických komunikáciách; bez nich by
        Služba nefungovala.
      </p>

      <h2>Ako cookies spravovať</h2>
      <p>
        Cookies môžeš kedykoľvek zmazať alebo zablokovať v nastaveniach svojho
        prehliadača. Zablokovanie nevyhnutných cookies však môže znemožniť
        prihlásenie a používanie Služby.
      </p>

      <h2>Zmeny</h2>
      <p>
        Ak v budúcnosti pridáme analytické alebo iné voliteľné cookies, najprv
        si vyžiadame tvoj súhlas a tento dokument aktualizujeme. Súvisiace
        spracúvanie údajov popisuje{" "}
        <a href="/ochrana-osobnych-udajov">Ochrana osobných údajov</a>.
      </p>
    </>
  );
}
