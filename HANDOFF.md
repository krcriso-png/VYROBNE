# Klikado — Handoff / Rešerš pre nové vlákno

Tento dokument je odovzdávka rozrobenej práce. Nové vlákno nech si ho prečíta
ako prvé. Píš so zákazníkom **po slovensky** (Richard, netechnický).

---

## 1. Čo je Klikado
SaaS, ktorý z **jedného inzerátu** publikuje na viac portálov naraz (Bazoš SK,
Bazoš CZ, Bazár.sk) cez automatizáciu prehliadača. Beží na **Railway**
(služby: **web** = Next.js appka, **worker** = Playwright/BullMQ na pozadí),
Postgres na **Neon**, Redis pre frontu.

## 2. Železné pravidlo (NIKDY neporušiť)
**Klikado nesmie NIKDY informovať nepravdivo.** Každé publikovanie / mazanie /
stav musí byť **overené voči realite portálu**. Radšej pravdivo nahlás chybu než
falošný úspech. Zobrazuj **doslovnú hlášku portálu**, nehádaj príčinu.

## 3. Workflow / nasadzovanie (dôležité)
- Vývojová vetva: `claude/listing-saas-multiportal-nuj8nu`
- **Pred commitom vždy:** `npx tsc --noEmit -p tsconfig.json`
- Nasadenie = push na `main` (Railway auto-deploy). Pushuj **vetvu aj main**:
  ```
  git push -u origin claude/listing-saas-multiportal-nuj8nu
  git push origin claude/listing-saas-multiportal-nuj8nu:main
  ```
  (pri sieťovej chybe retry 2s/4s/8s/16s)
- Commit trailery (na koniec commit message):
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019tF4Xxp1gwq5hDXEbUiTus
  ```
- **Nikdy** nedávaj názov modelu do commitov/PR/kódu/artefaktov — len do chatu.
- Sandbox **nedovidí na portály** → správanie portálov overuje ZÁKAZNÍK naživo a
  posiela logy/screenshoty. Podľa nich ladíme.

## 4. Architektúra / kde čo je
- **Providery:** `src/providers/` — `bazos-sk` (základ), `bazos-cz` (dedí z SK),
  `bazar-sk`, `mock`. Spoločná logika v `base.ts` (`withContext`, `snapshot`,
  `debugShot`, `captureOne`).
- **Worker:** `src/worker/` — `index.ts` (entry, štart, purge), `service.ts`
  (runPublish/Update/Refresh/Delete/CheckStatus, session, kredity), `scheduler.ts`.
- **Kľúčové liby:** `src/lib/` — `ai.ts` (AI písanie inzerátu + návrh kategórie),
  `fx.ts` (€→Kč kurz ČNB), `moderation.ts` (skener zakázaného obsahu),
  `errors.ts` (classifyError), `status.ts` (displayListingStatus),
  `publishing.ts` (publish/unpublish/import), `bazos-categories.ts` (strom
  kategórií — ZATIAĽ ručný odhad!), `import-ad.ts`, `storage.ts` (S3 alebo
  DB-fallback ImageBlob), `notify.ts`, `email.ts`.
- **UI:** `src/app/(app)/…`, komponenty `src/components/…`
  (`PublishPanel`, `PhotoManager`, `CategoryPicker`, `AdminListingCard`, atď).
- Prisma schéma: `prisma/schema.prisma`. Obrázky sa bez S3 ukladajú do DB
  (tabuľka `ImageBlob`) — pozri bod 5.1.

## 5. OTVORENÉ PROBLÉMY (priorita zhora)

### 5.1 Databáza plná / objektové úložisko — NAJVYŠŠIA PRIORITA
- Neon má limit **512 MB** a **zaplnil sa** (chyba `could not extend file …
  project size limit (512 MB)`), lebo bez S3 idú **obrázky aj debug snímky do DB**.
- Už nasadené: worker pri štarte maže všetky `debug/*` bloby; debug sa už do DB
  nepchá (len malý výrez, žiadne HTML) — `src/lib/storage.ts` (`pruneDebugBlobs`,
  `objectStorageConfigured`), `src/providers/base.ts` (`captureOne`).
- **Treba overiť**, či sa DB po redeployi uvoľnila (zákazník: funguje appka?).
- **Trvalé riešenie:** nastaviť Cloudflare **R2** (S3-kompatibilné, zdarma) cez
  env premenné v Railway: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` (voliteľne `S3_REGION`,
  `S3_FORCE_PATH_STYLE`). Potom obrázky idú do R2 a DB ostane prázdna.
  → Spísať zákazníkovi presný postup R2 (ešte nebolo).

### 5.2 Bazár.sk — „submit-not-advanced" (skutočné zlyhanie publikovania)
- Reálna chyba: `Bazar.sk neodoslal inzerát … Pozri screenshot
  'submit-not-advanced'` — po kliknutí na odoslať sa formulár neposunie, aj keď
  sú polia vyplnené. Príčina zatiaľ neznáma (čaká na screenshot/HTML z naživo,
  keď bude DB uvoľnená). Kód: `src/providers/bazar-sk/index.ts` publish flow.

### 5.3 Bazár.sk — lokalita
- Prepísané podľa receptu: **zadaj PSČ ako prvé → počkaj → klikni PRVÚ ponuku**
  (whisperer selektor). `fillLocation` v `src/providers/bazar-sk/index.ts`.
- **Treba overiť naživo** + poslať logy `Lokalita – kandidáti`, `Lokalita – pokus`
  (`options`, `filled`). Podľa nich prípadne doladiť selektor ponuky.

### 5.4 Kategórie na 100 % (veľká rozrobená vec)
- Teraz: Klikado má **ručný odhad** stromu (`bazos-categories.ts`) a pri
  publikovaní **háda** podkategóriu (word-overlap) → občas zlá kategória.
- Poistka už nasadená: ak sa kategória nedá spoľahlivo priradiť, inzerát sa
  **neuverejní** a zaloguje `Kategóriu sa nepodarilo priradiť — reálne možnosti
  portálu` (v `bazos-sk/index.ts` `selectBestCategoryOption`).
- AI teraz kategóriu aj **navrhuje** (predvyplní picker) — `ai.ts`.
- **Plán (zákazník schválil „Vyber raz + potvrď"):**
  1. Stiahnuť REÁLNY strom kategórií (aj s hodnotami) z portálov a uložiť.
  2. Vo formulári vyberať z reálneho stromu.
  3. Pred publikovaním ukázať návrh pre ostatné portály + nechať potvrdiť/zmeniť.
  - Pozn.: prvé stiahnutie potrebuje 1 živý prechod (my na portály nedovidíme).
    Zákazník má poslať log `Kategóriu sa nepodarilo priradiť …` s reálnymi
    možnosťami — z toho sa dá postaviť mapovanie.

### 5.5 Opakované SMS overenie na Bazoši
- Nájdená a opravená príčina: `snapshot()` nevracal `validUntil`, tak sa overená
  session po publikovaní brala ako neplatná a prihlasovalo sa odznova (zahodili
  sa SMS-overené cookies). Fix v `base.ts` (`snapshot` teraz +7 dní).
- **Spoľahlivý fix pre zákazníka:** pridať v sekcii **Portály** k Bazošu aj
  **email + heslo** účtu (nielen telefón). Prihlásený overený účet SMS nepýta.
  Diagnostika dôvodu je v logu (anonymne vs. neúspešné prihlásenie).

### 5.6 Objektové úložisko pre plné snímky/HTML
- Kým nie je S3/R2, debug snímky sú len malé výrezy a HTML sa neukladá. Po
  nastavení R2 sa full-page snímky aj HTML zapnú automaticky (`captureOne`).

## 6. HOTOVÉ (na otestovanie zákazníkom) — očíslovaný zoznam
1–6 Mazanie/deaktivácia (bazár tok heslo→dôvod→potvrď, 1 e-mail, overené, nikdy
falošné „zmazané"). 7–10 Pravdivé stavy/hlášky („Nezverejnený", verbatim hláška,
emoji dôvod). 11 Mobil. 12–14 Fotky (multi-výber+akumulácia, poradie, titulná;
**+ oprava prvého výberu**). 15 Topovanie = 1 kredit/portál. 16 Landing
auth-aware. 17 Bazár auto-strip emoji. 18 Správny inzerát podľa ID. 19 Žiadny
falošný úspech (bazár – prerobené, viď 5.2). 20–21 Import existujúceho inzerátu.
22–25 Admin: detail používateľa, mazanie inzerátu s dôvodom+e-mail, blokovanie
účtu+e-mail, skener zakázaného obsahu. 26 AI písanie (Haiku, `AI_MODEL` env,
**funguje** — `ANTHROPIC_API_KEY` je nastavený). 27 Bazár lokalita (viď 5.3).
28 €→Kč prevod pre Bazoš CZ. 29 Portály rozdelené SK/CZ (výber len jednej krajiny).
+ SMS pomenovanie SK/CZ, + session persistence (5.5), + robustné screenshoty,
+ kategória-poistka (5.4), + AI návrh kategórie.

## 7. Env premenné (Railway)
- `ANTHROPIC_API_KEY` — nastavené (AI funguje).
- `AI_MODEL` — voliteľné; default `claude-haiku-4-5` (najlacnejší). Možno
  prepnúť na `claude-sonnet-5` / `claude-opus-4-8` bez zásahu do kódu.
- **Chýba a treba (5.1):** `S3_*` pre R2.
- Ostatné: `DATABASE_URL` (Neon), `REDIS_URL`, `AUTH_URL`, `ENCRYPTION_KEY`,
  `EMAIL_*`/`ADMIN_EMAIL`, `ENABLE_PORTALS`.

## 8. Ako testovať bez pálenia SMS/čísla
- Väčšinu appky (stavy, admin, fotky, mobil, kredity, import parsovanie) sa dá
  testovať bez reálneho čísla. Reálny Bazoš/Bazár SMS beh treba len na živé
  overenie publikovania. Číslo sa blokuje pri opakovaných SMS → testuj s odstupmi
  a ideálne s prihláseným účtom (5.5). Existuje aj `mock` provider (Demo Portál),
  no nie je vo výbere pri publikovaní (dá sa sprístupniť, ak treba).
