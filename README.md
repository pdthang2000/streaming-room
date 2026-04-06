# ListenRoom

A private, synchronized music listening room for a small group of friends. One room. No auth. No database. Music plays like a radio.

## Requirements

- Node.js 20+
- pnpm
- yt-dlp (`brew install yt-dlp`)

## Install

```bash
pnpm install
```

## Run

Open two terminals from the project root:

```bash
# Terminal 1 — Backend (port 4000)
pnpm dev:api

# Terminal 2 — Frontend (port 3000)
pnpm dev:web
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

To access from a phone on the same WiFi, open `http://<your-local-ip>:3000`.

## Stop

```bash
# Kill port 3000 (frontend)
lsof -ti :3000 | xargs kill -9

# Kill port 4000 (backend)
lsof -ti :4000 | xargs kill -9

# Kill both at once
lsof -ti :3000 | xargs kill -9; lsof -ti :4000 | xargs kill -9
```
