# Docker Deployment Guide

How to build, run, and verify ListenRoom using Docker Compose.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows) or Docker Engine + Docker Compose plugin (Linux)
- Git repository cloned locally

Verify your install:

```bash
docker --version        # Docker 24+ recommended
docker compose version  # Compose v2+
```

---

## First-time build

From the repository root:

```bash
docker compose up --build
```

This will:
1. Build the `api` image — installs deps, runs webpack, installs `ffmpeg` + `yt-dlp`
2. Build the `web` image — installs deps, runs `next build` with standalone output
3. Start both containers

The first build takes a few minutes (downloading base images, installing npm packages). Subsequent builds are faster due to Docker layer caching.

Once both services are running you'll see:

```
api   | Application is running on: http://localhost:4000
web   | ✓ Ready in ...
```

Open **http://localhost:3000** in your browser.

---

## Starting and stopping

```bash
# Start in the foreground (logs stream to terminal)
docker compose up

# Start in the background
docker compose up -d

# Stop containers (keeps volumes and images)
docker compose stop

# Stop and remove containers (keeps volumes and images)
docker compose down

# Stop and remove everything including the audio cache volume
docker compose down -v
```

---

## Rebuilding after code changes

Docker layer caching means only changed layers are rebuilt.

```bash
# Rebuild both services
docker compose up --build

# Rebuild one service only
docker compose build api
docker compose build web

# Rebuild and restart a single service without restarting the other
docker compose up --build -d api
```

> Both Dockerfiles run `COPY . .` before `pnpm install`, so any file change will
> invalidate the install layer. If you only changed source files and want a faster
> rebuild, this is a known trade-off — see [Optimising build cache](#optimising-build-cache) below.

---

## Testing the connection

### 1. API health check

```bash
curl http://localhost:4000
```

Should return a 200 response (even if it's just `{}` or `Hello World`).

### 2. yt-dlp is installed

```bash
docker compose exec api yt-dlp --version
```

### 3. ffmpeg is installed

```bash
docker compose exec api ffmpeg -version
```

### 4. Audio cache volume is mounted

```bash
docker compose exec api ls -la audio-cache/
```

Should show an empty directory on first run. Files appear here after the first song is downloaded.

### 5. Web can reach the API (server-side rewrite)

```bash
curl http://localhost:3000/api
```

The Next.js server proxies `/api/*` to `http://api:4000` inside Docker. A non-404 response confirms the rewrite is working.

### 6. WebSocket connection

Open http://localhost:3000 in a browser and open DevTools → Network → WS.  
You should see a WebSocket connection established to `ws://localhost:4000/socket.io/...` with status **101 Switching Protocols**.

---

## Viewing logs

```bash
# Both services
docker compose logs -f

# One service only
docker compose logs -f api
docker compose logs -f web

# Last 50 lines
docker compose logs --tail=50 api
```

---

## Deploying on EC2

### 1. Launch an instance

- **AMI**: Ubuntu 24.04 LTS
- **Instance type**: t3.micro (free tier) or t3.small for a smoother experience
- **Storage**: 20 GB gp3 is enough (audio cache lives in a Docker volume on the same disk)

### 2. Open ports in your security group

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22 | TCP | Your IP only | SSH |
| 3000 | TCP | 0.0.0.0/0 | Next.js frontend |
| 4000 | TCP | 0.0.0.0/0 | NestJS API + Socket.io |

Port 4000 must be public — the browser connects to it directly for Socket.io.

### 3. Install Docker on the instance

SSH in, then:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in so the group change takes effect
exit
```

Verify:

```bash
docker --version
docker compose version
```

### 4. Clone and start the app

```bash
git clone <your-repo-url> listenroom
cd listenroom
docker compose up --build -d
```

The first build takes a few minutes. Once done, open `http://<ec2-public-ip>:3000` in any browser.

### 5. Auto-restart on reboot

Nothing extra needed. The `restart: unless-stopped` policy means both containers come back automatically after an instance reboot or `docker compose` crash.

### 6. Deploying updates

```bash
git pull
docker compose up --build -d
```

Docker rebuilds only the layers that changed and restarts the affected containers. The audio cache volume is untouched.

---

## Audio cache persistence

Downloaded MP3 files live in a named Docker volume (`audio-cache`), mounted at `/app/audio-cache` inside the `api` container. The volume survives container restarts and rebuilds.

```bash
# Inspect the volume
docker volume inspect listenroom_audio-cache

# Clear the cache (forces re-download of all songs)
docker compose down -v
```

---

## Troubleshooting

### Web container can't reach the API

The Next.js server uses `API_URL=http://api:4000` (Docker internal DNS) for server-side rewrites. If you see errors like `ECONNREFUSED` in `docker compose logs web`, the API container may still be starting. Wait a few seconds and reload.

### `server.js` not found in web container

If the web container exits with `Cannot find module .../apps/web/server.js`, the standalone output path differs from what the Dockerfile expects. Find the correct path:

```bash
docker compose run --rm web find . -name "server.js"
```

Update the `CMD` in `apps/web/Dockerfile` to match.

### Port already in use

```bash
# Find what's using port 3000 or 4000
lsof -i :3000
lsof -i :4000
```

### yt-dlp fails to download a song

yt-dlp updates frequently. If downloads start failing, update it inside the running container:

```bash
docker compose exec api pip3 install --break-system-packages --upgrade yt-dlp
```

Or rebuild the image to get the latest release:

```bash
docker compose build --no-cache api
```

---

## Optimising build cache

Both Dockerfiles currently use `COPY . .` before `pnpm install`. This means any file change invalidates the install layer. For faster iteration on source-only changes, split the COPY into two steps:

```dockerfile
# Copy manifests first — this layer only rebuilds when dependencies change
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json nx.json ./
COPY apps/api/ ./apps/api/
COPY libs/ ./libs/
RUN pnpm install --frozen-lockfile

# Now copy source — changes here don't bust the install layer
COPY apps/api/src ./apps/api/src
RUN pnpm nx build api
```

The trade-off is that pnpm may complain about missing workspace packages (`apps/web` not present when building the API image). If that happens, add an empty placeholder or copy the full workspace.
