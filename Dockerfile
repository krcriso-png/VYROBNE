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
# System deps, installed once in the shared base so every stage (incl. the
# runtime) has them:
#  - openssl/CA for Prisma + TLS
#  - redis-server for the in-container queue used by the all-in-one start command
#  - the full set of shared libraries Chromium needs to launch (libglib2.0-0,
#    libnss3, libgbm1, …). Installing them explicitly here is more reliable than
#    relying on `playwright install-deps` at a later stage.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates redis-server \
    libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxcb1 libxkbcommon0 libatspi2.0-0 libx11-6 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
    libxtst6 libgbm1 libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
    fonts-liberation fonts-noto-color-emoji \
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
# IMPORTANT: copy node_modules from the BUILD stage, which ran `prisma generate`
# with the schema present. (The deps stage generated the client before the
# schema was copied, so its Prisma client is a stub that throws at runtime.)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /root/.cache/ms-playwright /root/.cache/ms-playwright
# Chromium's system libraries are installed in the base stage (shared here).
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
