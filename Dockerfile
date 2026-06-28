# ===========================================================================
# Multi-stage build for the Next.js app + worker.
#
# The worker is compiled together with the app so both share one image. The
# runtime command decides which process(es) to run:
#   - docker-compose runs `app` and `worker` as separate services
#   - a single-service host (e.g. Railway) runs scripts/start-all.sh, which
#     starts Redis + worker + web together.
# ===========================================================================
FROM node:22-bookworm-slim AS base
WORKDIR /app
# System deps: openssl/CA for Prisma+TLS, redis-server for the in-container
# queue used by the all-in-one start command.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates redis-server \
    && rm -rf /var/lib/apt/lists/*

# --- deps ---
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install
# Install the Chromium browser used by Playwright (browser) providers.
RUN npx playwright install --with-deps chromium

# --- build ---
FROM deps AS build
COPY . .
# Build in inline-queue mode so the BullMQ queue (and its Redis connection) is
# not constructed during `next build`. This is a build-time-only setting; the
# runtime stage does not inherit it, so the deployed app uses the real queue.
ENV INLINE_QUEUE=true
RUN npx prisma generate
RUN npm run build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
# Default to the in-container Redis; override REDIS_URL to use managed Redis.
ENV REDIS_URL=redis://127.0.0.1:6379
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /root/.cache/ms-playwright /root/.cache/ms-playwright
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/scripts ./scripts
RUN chmod +x scripts/start-all.sh
EXPOSE 3000
# All-in-one: Redis + migrations + seed + worker + web.
CMD ["sh", "scripts/start-all.sh"]
