# Klikado

> **Jeden inzerát, všetky portály.** Modern SaaS for managing and automatically
> publishing classified-ad listings across many portals from a single place.

A user creates **one** listing; the system publishes, updates, refreshes and
removes it on every selected portal (Bazoš SK/CZ, Bazar.sk, Marketplace,
InzerPro, …) automatically. Built **API-first** so a mobile app can reuse the
same backend.

---

## Architecture at a glance

```
┌──────────────┐    enqueue     ┌───────────────┐   BullMQ    ┌────────────────┐
│  Next.js app │ ─────────────► │ Redis (queue) │ ──────────► │  Worker process │
│  UI + API    │                └───────────────┘             │  (providers)    │
└──────┬───────┘                                              └───────┬─────────┘
       │ Prisma                                                       │ Playwright / HTTP
       ▼                                                              ▼
┌──────────────┐         ┌──────────────┐                    ┌─────────────────┐
│  PostgreSQL  │         │  S3 storage  │                    │ Inzertné portály │
└──────────────┘         └──────────────┘                    └─────────────────┘
```

| Concern        | Choice                                            |
| -------------- | ------------------------------------------------- |
| Frontend       | Next.js 15 (App Router), React 19, TypeScript, Tailwind |
| Backend / API  | Next.js Route Handlers (API-first)                |
| Database       | PostgreSQL + Prisma                               |
| Auth           | Auth.js (NextAuth v5) — email/password + Google   |
| Queue          | BullMQ + Redis                                    |
| Storage        | S3-compatible (MinIO / R2 / S3) + `sharp` pipeline |
| Billing        | Stripe (subscriptions, trials, auto-renew)        |
| Automation     | Playwright (browser) **and** HTTP (API) providers |
| Deploy         | Docker / Coolify / Railway (Kubernetes later)     |

### Key design decisions

- **Provider plugin architecture.** Every portal is a self-contained module in
  [`src/providers/`](src/providers) implementing one `Provider` interface
  (`login` / `publish` / `update` / `refresh` / `delete` / `checkStatus`).
  Adding a portal is a one-line change in
  [`registry.ts`](src/providers/registry.ts) — no changes elsewhere. Two
  integration styles are supported transparently: **API** (HTTP) and
  **BROWSER** (Playwright), so portals without an official API are covered.
- **Everything async & retryable.** Publish/update/refresh/delete all flow
  through a single BullMQ queue with exponential backoff. The worker scales
  horizontally and the scheduler enqueues due auto-refreshes.
- **Security-first.** Portal passwords, cookies and sessions are encrypted at
  rest with AES-256-GCM ([`src/lib/crypto.ts`](src/lib/crypto.ts)) and never
  returned to the client. Input is validated with zod; routes are gated by
  middleware.
- **Observability.** Every operation writes a human-readable `ActivityLog`
  (e.g. _"09:12 Published"_, _"09:15 CAPTCHA error"_) plus a durable `Job`
  record, surfaced in the dashboard and admin panel.

---

## Project structure

```
prisma/
  schema.prisma         # full data model (users, billing, listings, portals,
                        # publications, jobs, logs, notifications)
  seed.ts               # seeds portals from the registry + a demo admin
src/
  lib/
    auth.ts             # Auth.js config (credentials + Google)
    crypto.ts           # AES-256-GCM credential encryption
    db.ts redis.ts      # singletons
    queue/              # BullMQ producer + job contracts
    plans.ts            # subscription tiers & entitlements
    publishing.ts       # orchestration: publish / sync / unpublish / refresh
    storage.ts images.ts# S3 + sharp image pipeline
    stripe.ts validation.ts api.ts logger.ts
  providers/
    types.ts            # the Provider interface (the contract)
    base.ts             # BaseProvider + BrowserProvider (Playwright lifecycle)
    registry.ts         # where portals are wired in
    bazos-sk/ bazos-cz/ bazar-sk/ marketplace/ inzerpro/ mock/
  worker/
    index.ts            # BullMQ worker entrypoint + scheduler
    service.ts          # job → provider call → DB write
    scheduler.ts        # auto-refresh ticker
  app/
    api/                # API-first route handlers
    (app)/              # authenticated UI (dashboard, listings, …)
    login/ register/    # auth pages
```

---

## Try it online (free, no card)

Want a live URL you can open in a browser without installing anything? Follow
**[DEPLOY.md](DEPLOY.md)** — a step-by-step, non-technical guide to deploy to
Vercel + Neon for free using the built-in demo mode (`INLINE_QUEUE=true`), where
portal tasks run inline so no separate worker/Redis is needed.

## Getting started (local)

### 1. Prerequisites

- Node.js ≥ 20
- Docker (for Postgres, Redis, MinIO) — or bring your own services

### 2. Configure

```bash
cp .env.example .env
# Generate the secrets:
openssl rand -base64 32   # → AUTH_SECRET
openssl rand -hex 32      # → ENCRYPTION_KEY
```

### 3. Start infrastructure

```bash
docker compose up -d postgres redis minio minio-setup
```

### 4. Install, migrate, seed

```bash
npm install
npx playwright install chromium   # for browser providers
npm run prisma:migrate            # create the schema
npm run db:seed                   # portals + demo admin
```

### 5. Run

```bash
npm run dev      # Next.js app on http://localhost:3000
npm run worker   # queue worker (separate terminal)
```

Sign in with the demo admin: **admin@klikado.local / admin1234**.
The **mock** portal is enabled by default so you can exercise the full
publish → queue → worker → status flow without touching a real site.

> Running the whole stack in Docker: `docker compose up --build`.

---

## Adding a new portal

1. Create `src/providers/my-portal/index.ts` extending `BrowserProvider`
   (Playwright) or `BaseProvider` (HTTP API), implementing the interface verbs.
2. Register it in [`src/providers/registry.ts`](src/providers/registry.ts).
3. `npm run db:seed` to add it to the `Portal` catalogue.

That's it — the publish UI, queue, sync and admin panel pick it up
automatically. See `mock/` for a complete, runnable reference and `inzerpro/`
(API) / `bazos-sk/` (browser) for the two integration styles.

---

## Subscription plans

| Plan  | Active listings | Auto-refresh | Price       |
| ----- | --------------- | ------------ | ----------- |
| Free  | 3               | –            | 0           |
| Basic | 30              | ✓            | monthly/yearly |
| Pro   | unlimited       | ✓            | monthly/yearly |

A 7-day trial is attached to paid plans. Stripe webhooks keep entitlements in
sync ([`/api/webhooks/stripe`](src/app/api/webhooks/stripe/route.ts)).

---

## Security & compliance notes

- Credentials are encrypted at rest (AES-256-GCM). In production, source
  `ENCRYPTION_KEY` from a KMS / secret manager and rotate via envelope keys.
- Browser-automation providers must respect each portal's **Terms of Service**
  and rate limits. The included browser providers ship as documented reference
  flows with selectors centralised for easy maintenance; verify and enable them
  per portal before production use. The `marketplace` provider uses a
  pre-captured session rather than automating credential entry.
- Rate limiting, email verification enforcement and 2FA are scaffolded /
  documented as TODOs where a production deployment must complete them.

---

## Status & roadmap

**Implemented foundation:** data model, auth, plans/billing, image pipeline,
provider plugin system (API + browser), queue + worker + scheduler, sync,
encrypted credentials, core API, dashboard & listings UI, mock end-to-end flow,
Docker stack.

**Planned (per spec):** AI title/description generation, auto-translation,
CSV/Excel/XML import-export, e-shop connectors (WooCommerce/Shopify/Shoptet),
mobile apps, CRM for inquiries, listing analytics, push notifications, 2FA,
company API.
