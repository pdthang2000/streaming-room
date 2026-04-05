# ListenRoom — Application Flow Document

**Version:** 1.0.0  
**Type:** Business Analysis / System Flow  
**Audience:** Developers, contributors, and anyone seeking to understand how ListenRoom works end-to-end

---

## 1. Overview

ListenRoom is a single-room, synchronized music listening web app. There is no login, no database, and no playback controls. Music flows like a radio — anyone in the room hears the same song at the same point in time.

All real-time communication is handled via **Socket.io** between the Next.js frontend (port 3000) and the NestJS backend (port 4000). Audio files are served from the backend as static MP3s over HTTP Range requests.

---

## 2. System Components

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| `apps/web` | Next.js 14 (App Router) | UI, socket client, audio element |
| `apps/api` | NestJS | Room state, socket gateway, yt-dlp orchestration |
| `libs/shared` | TypeScript | Shared types and EVENTS constants |
| `audio-cache/` | Filesystem | Downloaded MP3 files, served at `/audio/:fileId.mp3` |
| `yt-dlp` | System binary | Fetches and converts audio from YouTube / URLs |

---

## 3. Socket Event Contract

All event names are defined in `libs/shared/src/index.ts` under the `EVENTS` constant. They are never hardcoded as strings in application code.

### Client → Server

| Event | Payload | When |
|-------|---------|------|
| `joinRoom` | _(none)_ | Immediately after socket connects |
| `addToQueue` | `{ url: string }` | User submits a song |
| `skipSong` | _(none)_ | User clicks Skip |

### Server → Client

| Event | Payload | Scope |
|-------|---------|-------|
| `roomState` | `RoomStateWithElapsed` | Joining client only |
| `songStarted` | `RoomState` | All connected clients |
| `queueUpdated` | `RoomState` | All connected clients |
| `downloadStatus` | `DownloadStatus` | All clients (errors: submitter only) |

---

## 4. User Flows

---

### 4.1 User Opens the App (Initial Connection)

**Trigger:** User navigates to the ListenRoom URL in their browser.

**Actor:** Any visitor

#### Step-by-step

```
[Browser]                          [NestJS Backend]
    |                                      |
    |  Page loads, useRoom() mounts        |
    |  socket = io("http://host:4000")     |
    |------- TCP connect ----------------->|
    |                                      |
    |  socket.on('connect')                |
    |  emit("joinRoom")  ----------------->|
    |                                      |  RoomService.getRoomState()
    |                                      |  computes elapsed = (Date.now() - startedAt) / 1000
    |<------ emit("roomState") ------------|  to this client only
    |                                      |
```

**Frontend response to `roomState`:**

- Sets `currentSong` and `queue` in React state
- If a song is currently playing:
  - Sets `audio.src = /audio/{fileId}.mp3`
  - Sets `audio.currentTime = elapsed` (server-calculated, in seconds)
  - Calls `audio.play()`
  - If the browser blocks autoplay: registers a one-time `click` or `keydown` listener to resume playback on the next user interaction
- If nothing is playing: renders "Nothing playing yet"

**Result:** The user is immediately in sync with everyone else in the room.

---

### 4.2 User Adds a Song (URL or Search Query)

**Trigger:** User types a YouTube URL or a search term into the SearchBox and clicks "Add".

**Actor:** Any connected user

#### Step-by-step

```
[SearchBox Component]              [useRoom Hook]             [NestJS Backend]
    |                                    |                           |
    | User types "lofi hip hop"          |                           |
    | Clicks Add                         |                           |
    |                                    |                           |
    | if starts with "http" → use as-is  |                           |
    | else → prefix "ytsearch1:"         |                           |
    |                                    |                           |
    | onAdd("ytsearch1:lofi hip hop") -->|                           |
    |                                    | emit("addToQueue", {url}) |
    |                                    |-------------------------->|
    |                                    |                           |
    |                                    |                           | broadcast downloadStatus
    |                                    |                           | { status: 'downloading', progress: 0 }
    |<-----------------------------------|<--------------------------|  → all clients
    |                                    |                           |
    | [pulsing violet dot shown]         |                           | spawn yt-dlp child process
    |                                    |                           |
    |                                    |                           | as yt-dlp runs:
    |                                    |                           | broadcast downloadStatus
    |<-----------------------------------|<--------------------------| { status: 'downloading', progress: 42.3 }
    |                                    |                           |
    | [progress updates in UI]           |                           |
    |                                    |                           |
    |                                    |                           | yt-dlp exits 0
    |                                    |                           | MP3 saved to audio-cache/
    |                                    |                           | QueueItem created
    |                                    |                           |
    |                                    |                           | broadcast downloadStatus
    |<-----------------------------------|<--------------------------| { status: 'done', item }
    |                                    |                           |
    | [green dot, "Added" for 3s]        |                           | RoomService.enqueue(item)
    |                                    |                           |
    |                                    |                           | if nothing was playing:
    |                                    |                           |   RoomService.advanceSong()
    |                                    |                           |   → emits internal "room.songAdvanced"
    |                                    |                           |   → RoomGateway broadcasts "songStarted"
    |                                    |                           |
    |                                    |                           | broadcast queueUpdated { currentSong, queue }
    |<-----------------------------------|<--------------------------|  → all clients
    |                                    |                           |
    | [Queue list updates in UI]         |                           |
```

**Cache hit behavior:**  
If `audio-cache/{fileId}.mp3` already exists on disk AND metadata is in the in-memory `metaCache`, yt-dlp is skipped entirely. The song is enqueued instantly.

**Error behavior:**  
If yt-dlp fails (private video, geo-block, binary not found, non-zero exit), `downloadStatus { status: 'error', message }` is emitted **only to the submitting client**. All other clients are unaffected.

---

### 4.3 Song Auto-Advances (End of Song)

**Trigger:** The current song's duration timer expires on the server.

**Actor:** System (no user action)

#### Step-by-step

```
[NestJS Backend — RoomService]               [All Connected Clients]
    |                                                  |
    | setTimeout fires after duration seconds          |
    | advanceSong()                                    |
    |                                                  |
    | if queue is empty:                               |
    |   currentSong = null, startedAt = null           |
    |   emit internal "room.songAdvanced"              |
    |   → RoomGateway broadcasts "songStarted"         |
    |   → clients render "Nothing playing yet"         |
    |                                                  |
    | if queue has items:                              |
    |   pop next from queue                            |
    |   currentSong = next, startedAt = Date.now()    |
    |   emit internal "room.songAdvanced"              |
    |                                                  |
    | RoomGateway.handleSongAdvanced:                  |
    | broadcast "songStarted" { currentSong, queue } ->|
    |                                                  |
    |                               setCurrentSong()   |
    |                               setQueue()         |
    |                               audio.src = /audio/{fileId}.mp3
    |                               audio.currentTime = 0
    |                               audio.play()       |
    |                                                  |
    | schedule next advanceSong(duration * 1000)       |
```

**Result:** All clients seamlessly transition to the next song at the same moment, without any coordination between browsers.

---

### 4.4 User Skips the Current Song

**Trigger:** User clicks the "Skip →" button in the NowPlaying component.

**Actor:** Any connected user

#### Step-by-step

```
[NowPlaying Component]         [useRoom Hook]             [NestJS Backend]
    |                               |                            |
    | User clicks "Skip →"          |                            |
    | onSkip() callback ----------->|                            |
    |                               | emit("skipSong") --------->|
    |                               |                            |
    |                               |                 RoomService.advanceSong()
    |                               |                 (same path as auto-advance)
    |                               |                            |
    |                               |                 broadcast "songStarted"
    |<------------------------------|<---------------------------|  → all clients
    |                               |                            |
    | [NowPlaying updates]          |                            |
    | [Queue updates]               |                            |
    | [audio jumps to next song]    |                            |
```

**Note:** Skip is a broadcast action. Anyone clicking Skip affects the room for all users — there is no per-user control.

---

### 4.5 User Joins Mid-Song (Sync on Late Join)

**Trigger:** A user opens the app while a song is already playing.

**Actor:** Any visitor who arrives after playback has started

#### Step-by-step

```
[New Browser]                         [NestJS Backend]
    |                                         |
    | socket connects                         |
    | emit("joinRoom") --------------------->|
    |                                         |
    |                          elapsed = (Date.now() - state.startedAt) / 1000
    |                          e.g. "the song has been playing for 73.4 seconds"
    |                                         |
    |<--- emit("roomState", { currentSong,    |
    |       startedAt, queue, elapsed: 73.4 })|
    |                                         |
    | audio.src = /audio/{fileId}.mp3         |
    | audio.currentTime = 73.4               |
    | audio.play()                            |
    |                                         |
    | [User is in sync with the room]         |
```

**Why this works:** Every client streams the same MP3 file from the server and seeks to an offset derived from the same server clock. There is no peer-to-peer negotiation. The server's `Date.now()` is the single source of truth.

---

### 4.6 User Loses Connection and Reconnects

**Trigger:** Network drop, tab goes to sleep, or server restart.

**Actor:** Any connected user

#### Step-by-step

```
[Browser]                              [NestJS Backend]
    |                                         |
    | socket.on('disconnect')                 |
    | → setConnected(false)                   |
    | [UI shows "connecting…" badge]          |
    |                                         |
    | socket.io auto-reconnects               |
    | socket.on('connect')                    |
    | → setConnected(true)                    |
    | → emit("joinRoom") ------------------->|
    |                                         |
    |<-- emit("roomState", { ..., elapsed }) -|
    |                                         |
    | [audio seeks to current elapsed]        |
    | [user re-syncs to the room]             |
```

**Note:** If the server restarted, all in-memory state is reset. The rejoining client will receive `currentSong: null` and an empty queue. This is intentional — there is no persistence.

---

## 5. Audio Delivery

Audio files are served by NestJS via `@nestjs/serve-static`, which mounts `audio-cache/` at the `/audio` route.

```
audio-cache/abc123def456.mp3
→ http://localhost:4000/audio/abc123def456.mp3
```

`@nestjs/serve-static` handles **HTTP Range requests** automatically. This is essential: browsers send `Range: bytes=X-Y` headers when an `<audio>` element seeks. Without range support, `audio.currentTime = elapsed` would not work correctly.

The frontend audio URL is proxied through Next.js via `next.config.js` rewrites, so the browser fetches `/audio/...` on port 3000 which forwards to port 4000. This avoids CORS issues on audio requests.

---

## 6. State Ownership Summary

| State | Owner | Lives Where |
|-------|-------|-------------|
| `currentSong` | `RoomService` | In-memory on server |
| `startedAt` | `RoomService` | In-memory on server |
| `queue` | `RoomService` | In-memory on server |
| `elapsed` | Computed at read time | `RoomService.getRoomState()` |
| `metaCache` (title/duration) | `QueueService` | In-memory on server |
| MP3 files | Filesystem | `audio-cache/` on server |
| `currentSong` (UI) | `useRoom` hook | React state in browser |
| `queue` (UI) | `useRoom` hook | React state in browser |
| `downloadStatuses` | `useRoom` hook | React state in browser |
| `connected` | `useRoom` hook | React state in browser |

---

## 7. Data Flow Diagram — Adding a Song (Condensed)

```
User Input (SearchBox)
    ↓
SearchBox transforms input:
  "lofi hip hop" → "ytsearch1:lofi hip hop"
  "https://..." → "https://..." (unchanged)
    ↓
useRoom.addToQueue(url)
    ↓
socket.emit("addToQueue", { url })
    ↓ [network]
RoomGateway.handleAddToQueue()
    ↓
broadcast downloadStatus { downloading, 0% } → all clients
    ↓
QueueService.downloadAndEnqueue()
    ↓
yt-dlp child process
    ↓ (progress events)
broadcast downloadStatus { downloading, N% } → all clients
    ↓ (exit 0)
QueueItem created, MP3 on disk
    ↓
broadcast downloadStatus { done, item } → all clients
    ↓
RoomService.enqueue(item)
    ↓
  [if nothing playing]          [if already playing]
        ↓                               ↓
  advanceSong()               item appended to queue
        ↓                               ↓
  currentSong = item          broadcast queueUpdated → all clients
  startedAt = Date.now()
        ↓
  emit internal "room.songAdvanced"
        ↓
  RoomGateway broadcasts "songStarted" → all clients
        ↓
  useRoom.on("songStarted")
        ↓
  audio.src = /audio/{fileId}.mp3
  audio.currentTime = 0
  audio.play()
        ↓
  Browser fetches MP3 (Range request)
        ↓
  Music plays in sync across all clients
```

---

## 8. What This System Does Not Do

| Excluded Feature | Reason |
|------------------|--------|
| Play / pause / seek controls | Music flows like a radio — no per-user control |
| Per-user volume or queue management | No auth, no accounts |
| Persistent queue or history | State resets on server restart — intentional |
| Multiple rooms | One room only in v1 |
| Video playback | Audio only |
| Database | In-memory state is sufficient for this use case |
| Next.js API routes for state | All stateful logic lives in NestJS only |
