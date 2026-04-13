# ─── Builder ──────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm nx build api

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-slim

# Install ffmpeg (for yt-dlp post-processing) and yt-dlp via pip
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip \
    && pip3 install --break-system-packages yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the webpack bundle and the generated package.json
COPY --from=builder /app/dist/apps/api ./

# Install only runtime dependencies declared in the generated package.json
RUN npm install --omit=dev --ignore-scripts

RUN mkdir -p audio-cache

EXPOSE 4000

CMD ["node", "main.js"]
