#!/bin/sh
# ===========================================================================
# All-in-one start command for a single-service deployment (e.g. Railway).
#
# Runs Redis (in-container), applies migrations, seeds the portal catalogue,
# starts the BullMQ worker (with Playwright/Chromium for real portals) in the
# background, then runs the Next.js web server in the foreground.
#
# For a scaled production setup, run the web and worker as separate services
# against managed Redis/Postgres (see docker-compose.yml) instead.
# ===========================================================================
set -e

export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"

echo "→ Starting Redis…"
redis-server --daemonize yes --save "" --appendonly no

echo "→ Applying database migrations…"
npx prisma migrate deploy

echo "→ Seeding portals…"
npm run db:seed || echo "  (seed step failed — continuing)"

echo "→ Starting worker (background)…"
npm run worker:prod &

echo "→ Starting web server…"
exec npm run start
