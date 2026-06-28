# Nasadenie online (Vercel + Neon) — návod pre začiatočníkov

Tento návod ťa krok po kroku dovedie k tomu, aby si mal aplikáciu **online na
vlastnom odkaze `https://...`**, ktorý otvoríš v prehliadači aj na mobile.

- **Zadarmo, bez platobnej karty.**
- Netreba nič programovať — len klikať a kopírovať.
- Použijeme **demo režim** (`INLINE_QUEUE=true`): publikovanie funguje hneď
  v prehliadači bez potreby samostatného „workera" a Redisu.

> Čo v demo režime funguje: registrácia/prihlásenie, vytváranie inzerátov,
> publikovanie na **Demo Portal (Mock)** so zelenými/červenými stavmi, dashboard,
> admin. Čo nie: reálne portály (Bazoš a pod. — tie potrebujú worker + prehliadač),
> nahrávanie fotiek (potrebuje úložisko S3) a platby (potrebujú Stripe kľúče).
> Na vyskúšanie appky to úplne stačí.

Budeš potrebovať tri bezplatné účty: **GitHub** (už máš, kód je tam),
**Neon** (databáza) a **Vercel** (hosting). Celé to trvá ~10 minút.

---

## Krok 1 — Databáza na Neon

1. Otvor **https://neon.tech** a klikni **Sign up** → prihlás sa cez **GitHub**.
2. Klikni **Create project**. Názov nechaj aký chce, región vyber **Europe**.
3. Po vytvorení sa zobrazí **Connection string** — dlhý text začínajúci
   `postgresql://...`. Klikni **Copy** a ulož si ho (napr. do poznámok).
   Budeš ho potrebovať v Kroku 2.

   > ⚠️ **Dôležité:** vypni prepínač **„Connection pooling"** (alebo zvoľ
   > „Direct connection"). Reťazec **nesmie** obsahovať `-pooler` v adrese —
   > inak zlyhá vytvorenie databázových tabuliek pri nasadení.

---

## Krok 2 — Hosting na Vercel

1. Otvor **https://vercel.com** → **Sign up** → prihlás sa cez **GitHub**.
2. Klikni **Add New… → Project**.
3. Nájdi repozitár **VYROBNE** a klikni **Import**.
4. **Dôležité — správna vetva (branch):** kód je na vetve
   `claude/listing-saas-multiportal-nuj8nu`, nie na hlavnej.
   - Po importe choď do **Settings → Git → Production Branch**, prepíš na
     `claude/listing-saas-multiportal-nuj8nu` a ulož.
   - (Alebo si na GitHube zlúč túto vetvu do `main` cez Pull Request — potom
     netreba meniť nič.)
5. Ešte pred nasadením otvor sekciu **Environment Variables** a pridaj tieto
   položky (Name → Value):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | *(vlož Connection string z Neonu z Kroku 1)* |
   | `INLINE_QUEUE` | `true` |
   | `AUTH_SECRET` | *(napíš aspoň 30 náhodných znakov, napr. búchaj do klávesnice)* |
   | `ENCRYPTION_KEY` | *(napíš aspoň 20 náhodných znakov)* |
   | `AUTH_TRUST_HOST` | `true` |
   | `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | `1` |

6. Klikni **Deploy** a počkaj ~2–3 minúty, kým to zostaví.
7. Po dokončení klikni na vygenerovaný odkaz (napr.
   `https://vyrobne-xxxx.vercel.app`). **To je tvoja appka online.**

---

## Krok 3 — Vyskúšaj si to

1. Klikni **Prihlásiť sa** a použi demo účet:
   - **email:** `admin@inzeromat.local`
   - **heslo:** `admin1234`
2. V ľavom menu choď do **Portály** → pri *Demo Portal (Mock)* klikni
   **Pripojiť** → zadaj hocijaký login a heslo → **Uložiť**.
3. Choď do **Inzeráty → Nový inzerát**, vyplň názov, popis, cenu a kategóriu →
   **Vytvoriť a pokračovať**.
4. Dole zaškrtni **Demo Portal (Mock)** a klikni **Publikovať**. Po chvíľke
   uvidíš **zelený bod 🟢 (publikované)** a odkaz na „inzerát".
5. V **Prehľade** (dashboard) uvidíš počty a v **Admin** zoznam používateľov.

Hotovo — appka beží online a vieš si ju rozklikať odkiaľkoľvek. 🎉

---

## Časté otázky

- **Appka po čase „zaspí" a prvé načítanie je pomalé.** To je normálne na
  bezplatnom Vercel/Neon tieri — po pár sekundách nabehne.
- **Chcem reálne portály (Bazoš…), fotky a platby.** To je už „ostrá" verzia —
  potrebuje samostatný worker, Redis a úložisko. Pozri `README.md` a
  `docker-compose.yml` (plná architektúra). S nastavením ti viem pomôcť.
- **Zmenil som kód / vetvu.** Vercel po každom pushnutí do produkčnej vetvy
  nasadí novú verziu automaticky.
