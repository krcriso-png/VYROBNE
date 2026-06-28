# Nasadenie reálnej verzie na server (Railway)

Tento návod nasadí **plnú verziu** appky na server, kde beží worker +
Playwright prehliadač — takže **reálne portály (Bazoš) môžu reálne posielať
inzeráty**. Všetko beží ako **jedna služba** (web + worker + Redis v jednom
kontajneri), aby bolo nastavenie čo najjednoduchšie.

> ⚠️ **Realistické očakávania:** automatizácia reálneho Bazoša je „best-effort".
> Pri prvom pokuse to skoro určite niekde zaškrípe (prihlásenie, cookie lišta,
> CAPTCHA, iné názvy polí). To je normálne — pozrieme sa do logov a postupne to
> doladíme. Tento krok ti dá **prostredie, kde sa to dá reálne skúšať**.

---

## ČASŤ A — Nová databáza (Neon) · ~3 min

Pre čistotu použijeme **samostatnú databázu** (oddelenú od Vercel dema).

1. [neon.tech](https://neon.tech) → **Create project** (región Europe).
2. Skopíruj **Connection string** — opäť **bez** „Connection pooling" (nesmie
   obsahovať `-pooler`). Klikni **Show password** → **Copy**.

---

## ČASŤ B — Railway · ~7 min

1. Choď na **[railway.app](https://railway.app)** → **Login** → cez **GitHub**.
2. **New Project** → **Deploy from GitHub repo** → vyber **`VYROBNE`**
   (ak treba, povoľ Railway prístup k repozitáru).
3. Railway nájde `Dockerfile` a **začne stavať** image (inštaluje aj prehliadač
   Chromium, takže prvý build trvá ~5–10 min — pokojne nechaj bežať).
4. Otvor službu → záložka **Variables** → pridaj tieto premenné:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | *(connection string z novej Neon DB)* |
   | `AUTH_SECRET` | `LlydXECG1QjWZfDRfiLZvAdRWBrJ1QyYmtcpjL7UcLG61w8n` |
   | `ENCRYPTION_KEY` | `3a52fcb729f19443685d032df4082de4e9d15b465a49e9696e68d5c4189a6b54` |
   | `AUTH_TRUST_HOST` | `true` |
   | `ENABLE_PORTALS` | `mock,bazos-sk,bazos-cz` |

   *(Redis je už zabudovaný v kontajneri — `REDIS_URL` netreba nastavovať.)*

5. Choď do **Settings → Networking** → **Generate Domain**. Tým dostaneš verejnú
   adresu `https://....up.railway.app`.
6. Railway po pridaní premenných automaticky znova nasadí. Počkaj na zelený stav
   **Active / Deployed**.

---

## ČASŤ C — Vyskúšaj reálny Bazoš

1. Otvor svoju Railway adresu → **Prihlásiť sa**: `admin@inzeromat.local` /
   `admin1234`.
2. **Portály** → teraz uvidíš aj **Bazoš SK** a **Bazoš CZ**. Pri Bazoš SK klikni
   **Pripojiť** → zadaj **svoj reálny Bazoš login a heslo** → **Uložiť**.
   *(Heslo sa uloží zašifrované, AES-256-GCM.)*
3. **Inzeráty → Nový inzerát** → vyplň → **Vytvoriť**.
4. Zaškrtni **Bazoš SK** → **Publikovať**.
5. **Sleduj, čo sa deje:**
   - V appke: stav portálu (🟡 čaká → 🟢 / 🔴) a posledné chyby na dashboarde.
   - V Railway: služba → **Logs** ukazuje kroky workera v reálnom čase
     („Login Bazoš", „Filling listing form", prípadne chybu).

---

## Keď to (zatiaľ) nezafunguje

To je očakávané. Pošli mi prosím:
- čo ukazuje **stav portálu** v appke,
- a posledných pár riadkov z **Railway → Logs**.

Podľa toho upravím konkrétny krok Bazoš automatizácie (názvy polí, cookie lištu,
poradie krokov) a pushnem opravu — Railway sa sám prenasadí a skúsiš znova.

---

## Poznámky

- **Cena:** Railway dáva malý štartovací kredit; pre trvalý chod treba plán
  ~5 €/mes (môže pýtať kartu).
- **Fotky:** nahrávanie fotiek potrebuje úložisko (S3/R2). Bez neho skús najprv
  publikovať bez fotiek; úložisko doplníme ako ďalší krok.
- **Facebook Marketplace** zámerne necháme bokom — jeho podmienky automatizáciu
  zakazujú.
- Toto je „all-in-one" nasadenie ideálne na testovanie. Na ostrú prevádzku sa
  web a worker oddelia na samostatné služby s managed Redis/Postgres
  (`docker-compose.yml`).
