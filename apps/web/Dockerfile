# ─── Builder ──────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm nx build web

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Standalone output mirrors the monorepo directory structure due to outputFileTracingRoot
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
