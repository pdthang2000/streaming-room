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

RUN pnpm nx build api

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-slim

# Install ffmpeg (for yt-dlp post-processing) and yt-dlp via pip
# Cache mounts speed up repeated builds without bloating the image layer
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    --mount=type=cache,id=pip,target=/root/.cache/pip \
    apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip \
    && pip3 install --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the webpack bundle and the generated package.json
COPY --from=builder /app/dist/apps/api ./

# Install only runtime dependencies declared in the generated package.json
RUN npm install --omit=dev --ignore-scripts

RUN mkdir -p audio-cache

EXPOSE 4000

CMD ["node", "main.js"]
