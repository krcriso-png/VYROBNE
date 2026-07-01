# Klikado na Hetzner — kompletný návod (od nuly po beh na klikado.sk)

Tento návod ťa prevedie od založenia servera až po funkčné **https://klikado.sk**.
Z tvojej strany je to hlavne **kopírovanie príkazov**. Prvé spustenie trvá ~10 min
(väčšinou len čakáš, kým sa to postaví).

> Odhad ceny: server **CX22 ~4,5 €** + malý poplatok za IPv4 + DPH → reálne
> **~5–5,5 €/mesiac**. Účtuje sa po hodinách, zrušíš kedykoľvek.

---

## ČASŤ 1 — Založ server na Hetzner (~5 min)

1. Choď na **[console.hetzner.cloud](https://console.hetzner.cloud)** → **Sign Up**,
   zaregistruj sa a over e-mail. *(Prvýkrát môžu chcieť overenie kartou/dokladom.)*
2. **+ New Project** → pomenuj napr. `Klikado` → otvor projekt.
3. **Add Server** a nastav:
   - **Location:** **Nürnberg** (alebo Falkenstein) — blízko SK.
   - **Image:** **Ubuntu 24.04**.
   - **Type:** karta **Shared vCPU** → **CX22** (2 vCPU, **4 GB RAM**).
   - **Networking:** nechaj zapnuté **Public IPv4** (predvolené).
   - **SSH keys:** môžeš **preskočiť** — Hetzner ti pošle **root heslo na e‑mail**
     (jednoduchšie). *(Ak vieš pridať SSH kľúč, kľudne.)*
   - **Name:** napr. `klikado`.
   - Dole **Create & Buy now**.
4. Po chvíli uvidíš server v zozname a jeho **IPv4 adresu** — **odpíš si ju**
   (budeme jej hovoriť `IP_SERVERA`). Root heslo príde e‑mailom (ak si nedal kľúč).

> Firewall netreba nastavovať — Hetzner má porty otvorené (na rozdiel od Oracle).

---

## ČASŤ 2 — Pripoj sa na server

Na Macu otvor **Terminál**, na Windows **PowerShell**, a napíš (namiesto
`IP_SERVERA` daj tú svoju IP):

```bash
ssh root@IP_SERVERA
```

- Ak si **nedal SSH kľúč**: pýta si heslo → vlož **root heslo z e‑mailu**
  (pri prvom prihlásení ťa donúti nastaviť **nové vlastné heslo** — zapíš si ho).
- Ak si **dal SSH kľúč**: `ssh -i cesta/ku/kluc root@IP_SERVERA`.

Keď uvidíš `root@klikado:~#`, si na serveri. 🎉

---

## ČASŤ 3 — Rozbehni Klikado (kopíruj po blokoch)

**3a. Docker + projekt:**
```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/krcriso-png/vyrobne.git klikado
cd klikado
```

**3b. Vytvor .env a vygeneruj tajné kľúče:**
```bash
cp .env.production.example .env
# vypíše 3 hodnoty — o chvíľu ich vložíš do .env:
echo "AUTH_SECRET=$(openssl rand -base64 36)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)"
nano .env
```
V editore `nano`:
- prepíš `AUTH_SECRET`, `ENCRYPTION_KEY`, `POSTGRES_PASSWORD` vygenerovanými hodnotami,
- skontroluj `DOMAIN=klikado.sk` a `AUTH_URL=https://klikado.sk`,
- ulož: **Ctrl+O → Enter**, zatvor: **Ctrl+X**.

**3c. Spusti všetko (prvý build ~5–10 min):**
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

**3d. Pozri, či beží:**
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app   # Ctrl+C na ukončenie
```

---

## ČASŤ 4 — Nasmeruj doménu klikado.sk

Vo **Websupporte → Domény → klikado.sk → DNS záznamy** pridaj:
- `@` (koreň) → typ **A** → **IP_SERVERA**
- `www` → typ **A** → **IP_SERVERA** *(voliteľné)*

⚠️ **E‑maily nechaj tak** — MX záznamy nemeň, meníš len web (A záznamy).

Keď sa DNS rozšíri (pár minút až hodín), **Caddy si sám vytvorí HTTPS certifikát**
a `https://klikado.sk` začne fungovať (zámok v prehliadači). Netreba nič kupovať.

---

## ČASŤ 5 — Prihlásenie a dokončenie

1. Otvor **https://klikado.sk** → prihlás sa:
   **admin@klikado.local** / **admin1234** → hneď si v **Profile zmeň heslo**.
2. **Google prihlásenie** (voliteľné): v Google Cloud pridaj do *Authorized
   redirect URIs* `https://klikado.sk/api/auth/callback/google`, do `.env` doplň
   `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET`, a spusti:
   `docker compose -f docker-compose.prod.yml up -d`.
3. **Portály → Pripojiť** → zadaj svoje údaje k Bazoš / Bazar.

Hotovo — Klikado beží 24/7 na tvojom serveri a tvojej doméne. ✅

---

## Užitočné príkazy (na serveri, v priečinku `klikado`)

```bash
# aktualizovať na najnovšiu verziu:
git pull && docker compose -f docker-compose.prod.yml up -d --build

# reštart / stop / štart:
docker compose -f docker-compose.prod.yml restart
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

# logy (publikovanie na portály):
docker compose -f docker-compose.prod.yml logs -f worker

# záloha databázy do súboru:
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U klikado klikado > zaloha_$(date +%F).sql
```

---

## Riešenie problémov
- **https://klikado.sk nejde / bez zámku:** počkaj na DNS (over na
  [dnschecker.org](https://dnschecker.org) — má `klikado.sk` ukazovať na IP servera).
  Pozri `docker compose -f docker-compose.prod.yml logs -f caddy`.
- **„prebieha publikácia" dlho:** worker si po reštarte sám uprace zaseknuté úlohy;
  prípadne `docker compose -f docker-compose.prod.yml restart worker`.
- **Málo pamäte pri publikovaní:** `WORKER_CONCURRENCY=1` je už nastavené; ak treba
  viac, vezmi väčší server (CX32, 8 GB).
- **Server po reštarte:** všetko sa spustí **samo** (Docker má `restart: unless-stopped`).

Kdekoľvek sa zasekneš, napíš mi a pomôžem. 💪
