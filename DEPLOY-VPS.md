# Nasadenie Klikado na vlastný server (VPS) — bez Railway

Tento návod spustí **celé Klikado** (web + worker + prehliadač + databáza + HTTPS)
na jednom serveri, cez Docker. Funguje na **Oracle Cloud Free (zadarmo)** aj na
platenom VPS (Hetzner, Contabo…). Postup je rovnaký, líši sa len založenie servera.

---

## ČASŤ A — Server zadarmo (Oracle Cloud Free)

> Alternatíva: ak nechceš Oracle, kúp si **Hetzner CX22** (~5 €/mes) a preskoč na
> časť A2 (potrebuješ len IP servera a SSH prístup).

1. Choď na **[oracle.com/cloud/free](https://www.oracle.com/cloud/free/)** →
   **Start for free**. Zaregistruj sa (potrebuje kartu na overenie totožnosti,
   ale **Always Free** zdroje sa neúčtujú).
2. V konzole: **Menu → Compute → Instances → Create instance**.
   - **Image:** Canonical **Ubuntu 22.04**.
   - **Shape:** *Change shape* → **Ampere (ARM)** → **VM.Standard.A1.Flex** →
     nastav **2 OCPU a 12 GB RAM** (stále „Always Free").
   - **SSH keys:** *Generate a key pair for me* → **stiahni si privátny kľúč**
     (budeš ho potrebovať na prihlásenie).
   - **Create.** Počkaj, kým je stav **Running**, a odpíš si **Public IP address**.
   > Ak píše „Out of capacity", skús iný región alebo o pár hodín neskôr — ARM
   > kapacita zadarmo býva vyťažená. Keď to nepôjde, prejdi na Hetzner.
3. **Otvor porty 80 a 443:** v detaile instancie klikni na **Subnet** →
   **Security List** → **Add Ingress Rules** → pridaj dve pravidlá:
   - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination port **80**
   - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination port **443**

### A2 — Prihlásenie na server
Z počítača (Terminál na Macu / PowerShell na Windows):
```bash
ssh -i cesta/k/stiahnutemu_kluc.key ubuntu@TVOJA_IP
```

---

## ČASŤ B — Nasmeruj doménu

Vo Websupporte (DNS pre `klikado.sk`) pridaj **A záznam**:
- `@` (koreň) → **A** → *(Public IP servera)*
- `www` → **A** → *(rovnaká IP)* — voliteľné

E-maily (MX záznamy) nechaj tak, meníš len web.

---

## ČASŤ C — Rozbehni Klikado na serveri

Na serveri (cez SSH) spusti tieto príkazy (skopíruj celý blok):

```bash
# 1) Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# 2) Firewall v Ubuntu (okrem Oracle Security List)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true

# 3) Stiahni projekt
git clone https://github.com/krcriso-png/vyrobne.git klikado
cd klikado

# 4) Vytvor .env z ukážky a vygeneruj tajné kľúče
cp .env.production.example .env
echo "AUTH_SECRET=$(openssl rand -base64 36)"        # skopíruj do .env
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"        # skopíruj do .env
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)"     # skopíruj do .env
nano .env   # vlož vygenerované hodnoty, over DOMAIN a AUTH_URL, ulož (Ctrl+O, Enter, Ctrl+X)

# 5) Spusti všetko (prvý build ~5–10 min, sťahuje aj prehliadač Chromium)
docker compose -f docker-compose.prod.yml up -d --build

# 6) Sleduj log (Ctrl+C na ukončenie sledovania, beží ďalej)
docker compose -f docker-compose.prod.yml logs -f app
```

Keď DNS ukazuje na server, **Caddy si sám vytvorí HTTPS certifikát** a
`https://klikado.sk` začne fungovať (zámok v prehliadači).

---

## ČASŤ D — Prihlásenie a dokončenie

1. Otvor `https://klikado.sk` → prihlás sa: **admin@klikado.local** / **admin1234**
   (hneď si v profile zmeň heslo).
2. **Google prihlásenie** (voliteľné): v Google Cloud pridaj do *Authorized
   redirect URIs* `https://klikado.sk/api/auth/callback/google` a do `.env`
   doplň `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET`, potom:
   `docker compose -f docker-compose.prod.yml up -d`.
3. **Portály → Pripojiť** → zadaj svoje prihlasovacie údaje k Bazoš/Bazar.

---

## Užitočné príkazy

```bash
# aktualizácia na najnovšiu verziu:
cd klikado && git pull && docker compose -f docker-compose.prod.yml up -d --build

# reštart:
docker compose -f docker-compose.prod.yml restart

# logy workera (publikovanie):
docker compose -f docker-compose.prod.yml logs -f worker

# záloha databázy:
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U klikado klikado > zaloha.sql
```

## Poznámky / riešenie problémov
- **RAM:** ARM Free s 12 GB RAM je pohodlný. Na malom serveri drž
  `WORKER_CONCURRENCY=1` (už je nastavené).
- **„Out of capacity" na Oracle:** skús iný región / neskôr, alebo prejdi na
  Hetzner CX22 — návod (časť C/D) je identický.
- **HTTPS nenabehne:** skontroluj, že DNS `klikado.sk` ukazuje na IP servera a
  že porty 80/443 sú otvorené (Oracle Security List **aj** iptables).
