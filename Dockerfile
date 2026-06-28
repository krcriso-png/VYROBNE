# ===========================================================================
# Multi-stage build for the Next.js app + worker.
# The worker is compiled with the app so both share one image; the runtime
# command selects which process to run (see docker-compose).
# ===========================================================================
FROM node:22-bookworm-slim AS base
WORKDIR /app
# Playwright (Chromium) system dependencies for browser-automation providers.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- deps ---
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install
# Install the Chromium browser used by Playwright providers.
RUN npx playwright install --with-deps chromium

# --- build ---
FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /root/.cache/ms-playwright /root/.cache/ms-playwright
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3000
CMD ["npm", "run", "start"]
