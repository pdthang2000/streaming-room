# 02 — Architecture

Read this before writing any application logic.

---

## System Overview

```
Browser (Next.js)
    │
    ├── HTTP GET /audio/:fileId        ← stream MP3 file (range requests)
    ├── HTTP POST /api/queue/add       ← submit a song URL or search query
    │
    └── WebSocket (Socket.io)
            │
            ├── emit: joinRoom         → server sends back current room state + elapsed
            ├── emit: addToQueue       → server downloads + enqueues song
            │
            ├── on: roomState          ← initial state snapshot on join
            ├── on: queueUpdated       ← a new song was added to the queue
            ├── on: songStarted        ← new song is now playing (with startedAt)
            └── on: downloadStatus     ← progress/error feedback for a song being added
```

---

## Room State (server-side, in memory)

```ts
interface RoomState {
  currentSong: QueueItem | null   // the song currently playing
  startedAt: number | null        // Date.now() when current song started playing
  queue: QueueItem[]              // upcoming songs (not including currentSong)
}
```

This lives as a plain object in the `RoomService` singleton. No database.
If the server restarts, state resets. That is acceptable.

---

## QueueItem

```ts
interface QueueItem {
  id: string           // uuid, generated at enqueue time
  title: string        // extracted by yt-dlp
  duration: number     // in seconds, extracted by yt-dlp
  fileId: string       // filename stem used to serve audio: /audio/:fileId
  sourceUrl: string    // original URL the user submitted
  addedBy: string      // socket id or anonymous label
}
```

---

## The Sync Problem — How "Join at 1:30" Works

When a client connects, the server calculates:

```ts
const elapsed = (Date.now() - roomState.startedAt) / 1000
```

This value is sent to the joining client inside the `roomState` event.
The client seeks the `<audio>` element to `elapsed` before calling `.play()`.

The audio file is the same for everyone — all clients stream `/audio/:fileId`.
Because they all seek to the same offset, they are in sync.

**There is no peer-to-peer sync.** The server's clock is the source of truth.

---

## Song Lifecycle

```
User submits URL or search query
        │
        ▼
NestJS QueueService.addSong(url)
        │
        ├── check if fileId already cached (same source URL)
        │       └── if yes, skip download
        │
        ▼
yt-dlp spawned as child_process
  --extract-audio --audio-format mp3
  --output cache/:fileId.mp3
        │
        ├── emit downloadStatus { id, status: 'downloading', progress }
        │
        ▼
Download complete → QueueItem created
        │
        ▼
RoomService.enqueue(item)
        │
        ├── if nothing playing → immediately call advanceSong()
        │
        ▼
Socket gateway broadcasts: queueUpdated { queue }

---

advanceSong():
  pop first item from queue
  set currentSong = item
  set startedAt = Date.now()
  broadcast: songStarted { currentSong, startedAt }

  schedule setTimeout(advanceSong, item.duration * 1000)
  (when song ends, auto-advance)
```

---

## Audio Serving

NestJS serves a static `/audio` route pointing to the local cache directory.
Use `@nestjs/serve-static` or a manual Express `res.sendFile` with range support.

The cache directory is: `apps/api/audio-cache/`

File naming: `{fileId}.mp3` where `fileId` is a hash or slug of the source URL.

**Range requests are required** — browsers will send `Range: bytes=X-Y` headers
when the `<audio>` element seeks. The server must honor these or seeking will not work.

Using `@nestjs/serve-static` handles range requests automatically.

---

## Frontend Audio Player Logic

```ts
// On receiving 'roomState' event:
const { currentSong, startedAt, queue } = payload

if (currentSong) {
  const elapsed = (Date.now() - startedAt) / 1000
  audioRef.current.src = `/audio/${currentSong.fileId}.mp3`
  audioRef.current.currentTime = elapsed
  audioRef.current.play()
}

// On receiving 'songStarted' event:
// Same as above but elapsed will be ~0
```

---

## NestJS Module Layout

```
apps/api/src/
├── main.ts
└── app/
    ├── app.module.ts              ← root module, imports all below
    ├── room/
    │   ├── room.module.ts
    │   ├── room.service.ts        ← holds RoomState, advanceSong(), enqueue()
    │   └── room.gateway.ts        ← Socket.io gateway, handles joinRoom / addToQueue
    ├── queue/
    │   ├── queue.module.ts
    │   └── queue.service.ts       ← calls yt-dlp, manages audio-cache/
    └── audio/
        └── audio.module.ts        ← serves static files from audio-cache/
```

---

## Development vs Production

In development:
- Next.js dev server on :3000, rewrites `/api/*` and `/audio/*` to :4000
- NestJS on :4000

In production (same VPS):
- Build Next.js: `pnpm nx build web`
- Build NestJS: `pnpm nx build api`
- NestJS serves the Next.js static export OR run both behind nginx
- Recommend: nginx reverse proxy, both apps managed by pm2