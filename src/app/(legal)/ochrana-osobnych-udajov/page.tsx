import type { Metadata } from "next";
import { OPERATOR, AUTHORITIES } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Ochrana osobných údajov — Klikado",
  description:
    "Zásady spracúvania osobných údajov (GDPR) služby Klikado.",
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Ochrana osobných údajov</h1>
      <p className="text-sm text-muted-foreground">
        Účinné od {OPERATOR.updated}
      </p>

      <p>
        Tieto zásady vysvetľujú, ako prevádzkovateľ služby {OPERATOR.brand}{" "}
        spracúva osobné údaje používateľov v súlade s Nariadením (EÚ) 2016/679
        (GDPR) a zákonom č. 18/2018 Z. z. o ochrane osobných údajov.
      </p>

      <h2>1. Prevádzkovateľ</h2>
      <p>
        {OPERATOR.legalName}
        <br />
        Sídlo: {OPERATOR.address}
        <br />
        IČO: {OPERATOR.ico}
        {OPERATOR.dic ? <>, DIČ: {OPERATOR.dic}</> : null}
        <br />
        E-mail: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
        {OPERATOR.phone ? <>, tel.: {OPERATOR.phone}</> : null}
      </p>
      <p>
        Vo veciach ochrany osobných údajov nás môžeš kontaktovať na e-maile{" "}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
      </p>

      <h2>2. Aké údaje spracúvame</h2>
      <ul>
        <li>
          <strong>Registračné a účtové údaje:</strong> e-mail, meno, telefónne
          číslo, heslo (v šifrovanej/hashovanej podobe), prípadne údaje z
          prihlásenia cez Google.
        </li>
        <li>
          <strong>Údaje inzerátov:</strong> obsah, ktorý zadáš (názov, popis,
          cena, fotografie, lokalita, kontaktné údaje v inzeráte).
        </li>
        <li>
          <strong>Prístupové údaje k inzertným portálom:</strong> prihlasovacie
          údaje, ktoré uložíš pre publikovanie; ukladáme ich{" "}
          <strong>šifrované (AES-256-GCM)</strong> a nikdy sa nezobrazujú.
        </li>
        <li>
          <strong>Platobné údaje:</strong> pri platenom predplatnom spracúva
          platbu poskytovateľ Stripe; my neuchovávame čísla platobných kariet.
        </li>
        <li>
          <strong>Technické a prevádzkové údaje:</strong> IP adresa, logy
          operácií, nevyhnutné cookies (prihlásenie).
        </li>
      </ul>

      <h2>3. Účely a právne základy spracúvania</h2>
      <ul>
        <li>
          <strong>Poskytovanie služby</strong> (správa účtu, publikovanie a
          synchronizácia inzerátov) — plnenie zmluvy, čl. 6 ods. 1 písm. b) GDPR.
        </li>
        <li>
          <strong>Spracovanie platieb a fakturácia</strong> — plnenie zmluvy a
          plnenie zákonných povinností, čl. 6 ods. 1 písm. b) a c) GDPR.
        </li>
        <li>
          <strong>Komunikácia a podpora</strong> (odpovede na podnety, e-mailové
          upozornenia) — plnenie zmluvy a oprávnený záujem, čl. 6 ods. 1 písm. b)
          a f) GDPR.
        </li>
        <li>
          <strong>Zabezpečenie a prevádzka</strong> (logy, ochrana pred
          zneužitím) — oprávnený záujem, čl. 6 ods. 1 písm. f) GDPR.
        </li>
      </ul>

      <h2>4. Príjemcovia a sprostredkovatelia</h2>
      <p>
        Údaje spracúvame u dôveryhodných poskytovateľov, ktorí konajú ako naši
        sprostredkovatelia alebo samostatní prevádzkovatelia:
      </p>
      <ul>
        <li>
          <strong>Poskytovateľ hostingu a databázy</strong> (prevádzka
          aplikácie a úložisko dát).
        </li>
        <li>
          <strong>Stripe</strong> — spracovanie platieb.
        </li>
        <li>
          <strong>Poskytovateľ e-mailových služieb</strong> — doručovanie
          notifikácií.
        </li>
        <li>
          <strong>Inzertné portály</strong> (napr. Bazoš, Bazar.sk) — inzeráty
          a údaje, ktoré na ne sám publikuješ prostredníctvom služby.
        </li>
      </ul>

      <h2>5. Doba uchovávania</h2>
      <p>
        Osobné údaje uchovávame po dobu trvania účtu a následne po dobu
        nevyhnutnú na splnenie zákonných povinností (napr. účtovné a daňové
        doklady 10 rokov). Po zrušení účtu údaje, ktoré už nie sme povinní
        uchovávať, vymažeme alebo anonymizujeme.
      </p>

      <h2>6. Tvoje práva</h2>
      <p>Ako dotknutá osoba máš právo:</p>
      <ul>
        <li>na prístup k svojim údajom a na ich kópiu,</li>
        <li>na opravu nesprávnych a doplnenie neúplných údajov,</li>
        <li>na vymazanie („právo na zabudnutie"),</li>
        <li>na obmedzenie spracúvania,</li>
        <li>na prenosnosť údajov,</li>
        <li>namietať proti spracúvaniu z oprávneného záujmu,</li>
        <li>
          podať sťažnosť dozornému úradu: {AUTHORITIES.uoou}.
        </li>
      </ul>
      <p>
        Svoje práva si uplatníš e-mailom na{" "}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
      </p>

      <h2>7. Cookies</h2>
      <p>
        Používame iba nevyhnutné cookies. Podrobnosti nájdeš v{" "}
        <a href="/cookies">Zásadách používania cookies</a>.
      </p>

      <h2>8. Zmeny</h2>
      <p>
        Tieto zásady môžeme aktualizovať. Aktuálne znenie je vždy dostupné na
        tejto stránke s uvedeným dátumom účinnosti.
      </p>
    </>
  );
}
