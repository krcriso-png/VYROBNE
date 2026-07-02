import type { Metadata } from "next";
import { OPERATOR, AUTHORITIES } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Obchodné podmienky — Klikado",
  description: "Všeobecné obchodné podmienky služby Klikado.",
};

export default function TermsPage() {
  return (
    <>
      <h1>Všeobecné obchodné podmienky</h1>
      <p className="text-sm text-muted-foreground">
        Účinné od {OPERATOR.updated}
      </p>

      <h2>1. Úvodné ustanovenia a prevádzkovateľ</h2>
      <p>
        Tieto všeobecné obchodné podmienky (ďalej len „VOP") upravujú práva a
        povinnosti medzi prevádzkovateľom a používateľom pri používaní online
        služby {OPERATOR.brand}, dostupnej na {OPERATOR.site} (ďalej len
        „Služba").
      </p>
      <p>
        Prevádzkovateľ: {OPERATOR.legalName}, sídlo {OPERATOR.address}, IČO{" "}
        {OPERATOR.ico}
        {OPERATOR.dic ? <>, DIČ {OPERATOR.dic}</> : null}. {OPERATOR.registration}.{" "}
        {OPERATOR.icDph
          ? <>IČ DPH: {OPERATOR.icDph}.</>
          : OPERATOR.vatNote}{" "}
        Kontakt: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
        {OPERATOR.phone ? <>, {OPERATOR.phone}</> : null}.
      </p>

      <h2>2. Opis Služby</h2>
      <p>
        Služba je nástroj, ktorý používateľovi umožňuje vytvoriť inzerát na
        jednom mieste a automatizovane ho publikovať, upravovať, obnovovať a
        sledovať na inzertných portáloch tretích strán (napr. Bazoš, Bazar.sk).
        Služba koná v mene používateľa a na základe údajov, ktoré používateľ
        sám poskytne.
      </p>

      <h2>3. Registrácia a účet</h2>
      <ul>
        <li>
          Používanie Služby vyžaduje registráciu a vytvorenie účtu. Používateľ
          uvádza pravdivé a aktuálne údaje.
        </li>
        <li>
          Používateľ zodpovedá za utajenie prihlasovacích údajov a za všetky
          činnosti vykonané pod jeho účtom.
        </li>
        <li>Službu môžu využívať osoby staršie ako 16 rokov.</li>
      </ul>

      <h2>4. Kredity, predplatné a platby</h2>
      <ul>
        <li>
          Služba sa poskytuje v bezplatnom rozsahu a v platených plánoch /
          kreditoch podľa aktuálneho cenníka uvedeného v Službe.
        </li>
        <li>
          Publikovanie alebo obnova inzerátu môže spotrebovať kredit podľa
          popisu pri danej akcii. Aktuálny stav kreditov vidí používateľ vo
          svojom účte.
        </li>
        <li>
          Platby spracúva poskytovateľ platobných služieb Stripe. Ceny sú
          uvedené vrátane DPH, ak je prevádzkovateľ jej platcom.
        </li>
        <li>
          Predplatné sa uzatvára na zvolené obdobie; ak nie je uvedené inak,
          automaticky sa obnovuje, kým ho používateľ nezruší vo svojom účte.
        </li>
      </ul>

      <h2>5. Práva a povinnosti používateľa</h2>
      <ul>
        <li>
          Používateľ zodpovedá za obsah svojich inzerátov a za to, že má právo
          ich zverejniť a že neporušujú právne predpisy ani práva tretích osôb.
        </li>
        <li>
          Používateľ je povinný dodržiavať podmienky jednotlivých inzertných
          portálov, na ktoré prostredníctvom Služby publikuje.
        </li>
        <li>
          Je zakázané používať Službu na protiprávny obsah, spam, obchádzanie
          ochrán portálov či konanie v rozpore s dobrými mravmi.
        </li>
      </ul>

      <h2>6. Zodpovednosť</h2>
      <ul>
        <li>
          Služba sprostredkúva publikovanie na portály tretích strán.
          Prevádzkovateľ <strong>nie je prevádzkovateľom týchto portálov</strong>{" "}
          a nezodpovedá za ich dostupnosť, pravidlá, zmeny, zablokovanie účtu na
          portáli, odmietnutie alebo odstránenie inzerátu portálom.
        </li>
        <li>
          Niektoré portály vyžadujú overenie (napr. SMS kód) a môžu uplatňovať
          vlastné limity; ich nesplnenie môže zabrániť zverejneniu.
        </li>
        <li>
          Služba sa poskytuje „tak, ako je". Prevádzkovateľ vynakladá primeranú
          snahu o jej bezchybný chod, negarantuje však neprerušovanú
          dostupnosť.
        </li>
        <li>
          Prevádzkovateľ nezodpovedá za nepriame škody a jeho zodpovednosť je v
          rozsahu povolenom zákonom obmedzená do výšky sumy, ktorú používateľ
          za Službu uhradil za posledných 12 mesiacov.
        </li>
      </ul>

      <h2>7. Odstúpenie od zmluvy (spotrebiteľ)</h2>
      <p>
        Spotrebiteľ má právo odstúpiť od zmluvy do 14 dní bez uvedenia dôvodu.
        Keďže ide o poskytovanie digitálneho obsahu / služby, používateľ berie
        na vedomie, že{" "}
        <strong>
          udelením výslovného súhlasu so začatím poskytovania pred uplynutím
          lehoty na odstúpenie stráca právo na odstúpenie
        </strong>{" "}
        v rozsahu už poskytnutého plnenia. Odstúpenie zašli na{" "}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
      </p>

      <h2>8. Reklamácie</h2>
      <p>
        Ak Služba nefunguje ako má, napíš nám na{" "}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> alebo cez sekciu
        Podpora v aplikácii. Reklamáciu vybavíme bez zbytočného odkladu,
        najneskôr do 30 dní.
      </p>

      <h2>9. Trvanie a ukončenie</h2>
      <ul>
        <li>Používateľ môže účet kedykoľvek zrušiť.</li>
        <li>
          Prevádzkovateľ môže obmedziť alebo zrušiť účet pri porušení VOP alebo
          právnych predpisov.
        </li>
      </ul>

      <h2>10. Alternatívne riešenie sporov</h2>
      <p>
        Dozor nad ochranou spotrebiteľa vykonáva {AUTHORITIES.soi}. Spotrebiteľ
        má právo obrátiť sa na subjekt alternatívneho riešenia sporov, resp.
        využiť platformu RSO:{" "}
        <a href={AUTHORITIES.odr} target="_blank" rel="noreferrer">
          {AUTHORITIES.odr}
        </a>
        .
      </p>

      <h2>11. Záverečné ustanovenia</h2>
      <p>
        Vzťahy neupravené týmito VOP sa riadia právnym poriadkom Slovenskej
        republiky. Prevádzkovateľ môže VOP meniť; nové znenie zverejní na tejto
        stránke s dátumom účinnosti. Ochranu osobných údajov upravuje samostatný
        dokument <a href="/ochrana-osobnych-udajov">Ochrana osobných údajov</a>.
      </p>
    </>
  );
}
