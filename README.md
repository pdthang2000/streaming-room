# ListenRoom

A private, synchronized music listening room for a small group of friends. One room, no login, no database. Anyone who opens the link hears the same song at the same point in time — like a radio station you can add songs to.

---

## How It Works

- Open the app, enter a display name.
- Paste a YouTube URL or type a search term to add a song.
- Songs play in **round-robin order** — the queue rotates between users so everyone gets a fair turn.
- You can reorder or remove songs from your own personal queue.
- Only you can skip a song you added.
- The queue survives server restarts (state is saved to a JSON snapshot on disk).
- In Docker, a Cloudflare Tunnel makes the room accessible from anywhere.

---

## Prerequisites

### For local dev (without Docker)

- **Node.js 20+**
- **pnpm** — `npm install -g pnpm`
- **yt-dlp** — `pip install yt-dlp` (must be in `$PATH`)
- **ffmpeg** — `brew install ffmpeg` (macOS) or `sudo apt install ffmpeg` (Ubuntu)

Verify:

```bash
node --version   # 20+
pnpm --version
yt-dlp --version
ffmpeg -version
```

### For Docker

- **Docker Desktop** (Mac/Windows) or **Docker Engine + Compose plugin** (Linux)

```bash
docker --version         # 24+ recommended
docker compose version   # v2+
```

---

## Local Development (without Docker)

### Install dependencies

```bash
pnpm install
```

### Run both apps

```bash
pnpm nx run-many -t serve -p web,api --parallel
```

- Frontend: http://localhost:3000
- Backend: http://localhost:4000

The Next.js dev server proxies `/api/*` and `/audio/*` to the NestJS backend automatically via `next.config.js` rewrites.

### Run just one app

```bash
pnpm nx serve api   # NestJS only
pnpm nx serve web   # Next.js only
```

---

## Running with Docker

The Docker setup runs four containers: `api`, `web`, `caddy` (reverse proxy on :80), and `cloudflared` (Cloudflare Tunnel).

### First run

```bash
docker compose up --build
```

First build takes a few minutes (downloads base images, installs packages, installs ffmpeg + yt-dlp).

Once running, open **http://localhost:3000** in your browser.

### The Cloudflare Tunnel URL

`cloudflared` opens a quick tunnel with no configuration needed. Look for it in the logs:

```bash
docker compose logs cloudflared | grep trycloudflare
```

You'll see a URL like `https://random-words.trycloudflare.com`. Share that with friends to join the room from anywhere.

> **Note:** The URL changes every time `cloudflared` restarts. To get a stable custom domain, see [Custom domain setup](#custom-domain-with-cloudflare).

### Common Docker commands

```bash
# Start in background
docker compose up -d

# Stop (keeps volumes)
docker compose stop

# Stop and remove containers (keeps audio cache volume)
docker compose down

# Stop and wipe everything including the audio cache
docker compose down -v

# View logs
docker compose logs -f
docker compose logs -f api
docker compose logs -f cloudflared

# Rebuild after code changes
docker compose up --build

# Rebuild one service only
docker compose up --build -d api
```

---

## Production Deploy (EC2 / VPS)

### Using pre-built Docker Hub images

The `docker-compose.prod.yml` file uses pre-built images instead of building from source.

1. Set your Docker Hub username:

   ```bash
   export DOCKERHUB_USER=yourusername
   ```

2. Build and push images from your dev machine:

   ```bash
   docker build -t $DOCKERHUB_USER/listenroom-api:latest -f apps/api/Dockerfile .
   docker build -t $DOCKERHUB_USER/listenroom-web:latest -f apps/web/Dockerfile .
   docker push $DOCKERHUB_USER/listenroom-api:latest
   docker push $DOCKERHUB_USER/listenroom-web:latest
   ```

3. On the server:

   ```bash
   git clone <your-repo-url> listenroom
   cd listenroom
   DOCKERHUB_USER=yourusername docker compose -f docker-compose.prod.yml up -d
   ```

This exposes the API on `:4000` and the frontend on `:3000` directly — put your own reverse proxy (nginx, Caddy) in front as needed.

### Deploy updates

```bash
# On dev machine: build and push new images
docker build -t $DOCKERHUB_USER/listenroom-api:latest -f apps/api/Dockerfile . && docker push $DOCKERHUB_USER/listenroom-api:latest
docker build -t $DOCKERHUB_USER/listenroom-web:latest -f apps/web/Dockerfile . && docker push $DOCKERHUB_USER/listenroom-web:latest

# On server:
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

## Environment Variables

### `api` container

| Variable | Default | Purpose |
|---|---|---|
| `AUDIO_CACHE_DIR` | `{cwd}/apps/api/audio-cache` | Where MP3 files are stored |
| `STATE_DIR` | `{cwd}/apps/api/.dev-state` | Where snapshot JSON files are stored |

### `web` container

| Variable | Default | Purpose |
|---|---|---|
| `API_URL` | `http://localhost:4000` | Backend URL used for Next.js server-side rewrites |

In `docker-compose.yml`, `API_URL` is set to `http://api:4000` (Docker internal DNS).

### Custom domain with Cloudflare

To use a permanent custom domain instead of the random `trycloudflare.com` URL:

1. Create a tunnel in the Cloudflare dashboard and get a tunnel token.
2. In `docker-compose.yml`, replace the `cloudflared` command:

   ```yaml
   command: tunnel --no-autoupdate run --token ${CF_TUNNEL_TOKEN}
   ```

3. Add `CF_TUNNEL_TOKEN=your_token` to a `.env` file in the project root.

---

## YouTube Cookies (for age-gated or restricted videos)

If yt-dlp fails with authentication errors on certain videos, provide a `cookies.txt` file:

1. Export cookies from your browser using a browser extension (e.g. "Get cookies.txt LOCALLY").
2. Place the file at the project root as `cookies.txt`.
3. In `docker-compose.prod.yml`, the file is already mounted: `./cookies.txt:/app/cookies.txt`.
4. For dev Docker (`docker-compose.yml`), add the same volume mount to the `api` service if needed.

The API checks for `/app/cookies.txt` at download time and passes `--cookies` to yt-dlp if it exists.

---

## Audio Cache

Downloaded MP3 files live in a named Docker volume (`audio-cache`) mounted at `/app/audio-cache` in the `api` container. They persist across restarts and rebuilds.

Old MP3 files are **automatically deleted** 30 seconds after the song finishes playing, unless the same song is still in someone's queue.

```bash
# Check what's in the cache
docker compose exec api ls -lh audio-cache/

# Clear all cached audio (forces re-download)
docker compose down -v
```

---

## State Snapshots

The backend saves its queue state (current song, all personal queues, rotation order) to a JSON file every 500ms after any change, and on clean shutdown. On startup, it reads the snapshot back and resumes. If the current song's elapsed time exceeds its duration, it is automatically skipped and the next song starts.

```bash
# Dev: snapshot files are at
apps/api/.dev-state/room-state.json
apps/api/.dev-state/meta-cache.json

# Docker
docker compose exec api cat .dev-state/room-state.json
```

To start fresh (wipe all queue state):

```bash
# Dev
rm -rf apps/api/.dev-state

# Docker (state inside container is ephemeral, restart clears it)
docker compose restart api
```

---

## Debugging

### Backend won't start / port in use

```bash
lsof -ti :4000 | xargs kill -9
lsof -ti :3000 | xargs kill -9
```

### yt-dlp fails to download

```bash
# Check yt-dlp is installed and working
yt-dlp --version
yt-dlp "ytsearch1:lofi hip hop" --extract-audio --audio-format mp3 -o /tmp/test.%(ext)s

# Update yt-dlp (fixes most platform-specific failures)
pip install --upgrade yt-dlp

# In Docker
docker compose exec api pip3 install --break-system-packages --upgrade yt-dlp
```

### Audio won't play / seeking broken

- Check ffmpeg is installed: `ffmpeg -version` (or `docker compose exec api ffmpeg -version`).
- Open DevTools → Network → filter by `.mp3` — you should get **HTTP 206** (partial content), not 200. If you get 200, range requests aren't working.
- Check `X-Accel-Buffering: no` is in the response headers (prevents Caddy from buffering the file).

### WebSocket not connecting

- DevTools → Network → WS tab — look for a connection to `ws://localhost:4000/socket.io/...` with status **101 Switching Protocols**.
- In Docker, verify Caddy is proxying `/socket.io*` to `api:4000` (check `Caddyfile`).
- Check Caddy logs: `docker compose logs caddy`.

### Frontend shows "connecting..." forever

- Local dev: the socket connects directly to `http://localhost:4000`.
- Docker / tunnel: the browser connects to `window.location.origin`, and Caddy proxies it. Make sure you're accessing via the Caddy URL (port 80 or the tunnel URL), not `localhost:3000`.

### Queue state is wrong after restart

```bash
# View the snapshot
cat apps/api/.dev-state/room-state.json        # dev
docker compose exec api cat .dev-state/room-state.json  # Docker

# Clear it
rm -rf apps/api/.dev-state    # dev
docker compose restart api    # Docker
```

### Song auto-skipped on restart

Expected behavior. If `Date.now() - startedAt > duration` when the server loads the snapshot, the song is already over. The server calls `advanceSong()` immediately on startup.

---

## Running Tests

```bash
# All backend tests
pnpm nx run api:test

# Watch mode
pnpm nx run api:test --watch

# Specific file
pnpm nx run api:test --testPathPattern=room.service
```

Tests use an isolated `STATE_DIR` (temp directory per test run, configured in `apps/api/src/test/setup.ts`).

---

## Project Layout Reference

```
apps/
  api/src/app/
    room/
      room.service.ts      ← round-robin queue logic, state, snapshot persistence
      room.gateway.ts      ← Socket.io handlers
      room.controller.ts   ← GET /room (debug)
    queue/
      queue.service.ts     ← yt-dlp download, meta cache, MP3 cleanup
    audio/
      audio.controller.ts  ← GET /audio/:fileId.mp3 with range request support

  web/
    lib/socket.ts          ← singleton Socket.io client
    hooks/
      useRoom.ts           ← composer hook
      useSocket.ts         ← connection + joinRoom
      useRoomState.ts      ← room state + queue actions
      useAudioPlayer.ts    ← audio sync, stall recovery, autoplay handling
    components/
      UsernameModal.tsx    ← first-visit name prompt
      NowPlaying.tsx       ← current song display + skip button
      Queue.tsx            ← round-robin preview (one slot per user)
      PersonalQueue.tsx    ← your songs with reorder/remove controls
      SearchBox.tsx        ← search input + download status

libs/shared/src/index.ts   ← all shared types and EVENTS constants

Caddyfile                  ← reverse proxy config
docker-compose.yml         ← local build (api + web + caddy + cloudflared)
docker-compose.prod.yml    ← production deploy using Docker Hub images
```
