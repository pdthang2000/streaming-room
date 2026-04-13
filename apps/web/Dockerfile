# syntax=docker/dockerfile:1
# ─── Builder ──────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN npm install -g pnpm

WORKDIR /app

# Copy only workspace manifests first so the install layer is cached
# unless the lockfile or package.json files change
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY libs/shared/package.json libs/shared/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source after install — a source-only change only invalidates the build step
COPY . .

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
