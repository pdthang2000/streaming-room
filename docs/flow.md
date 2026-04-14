# ListenRoom — Application Flow Document

**Reflects:** actual codebase as of 2026-04-14
**Audience:** developers working on the app

---

## 1. Overview

ListenRoom is a single-room synchronized music listening app. There is no database, no login, and no playback controls. Music flows like a radio. The queue is fair — it rotates between users (round-robin) so no one person monopolizes the playlist.

All real-time communication goes through **Socket.io** between the Next.js frontend and the NestJS backend. Audio is served from the backend as MP3 files over HTTP range requests. The backend persists its state to a snapshot file so the queue survives restarts.

```
Browser (Next.js on :3000)
    │
    ├── WebSocket (Socket.io) ──────────────── NestJS on :4000
    ├── GET /audio/:fileId.mp3 ─────────────► NestJS AudioController
    └── GET /api/room (debug) ──────────────► NestJS RoomController

In production, Caddy on :80 proxies everything:
    /socket.io*  →  api:4000
    /audio/*     →  api:4000
    /api/*       →  api:4000
    /*           →  web:3000
```

---

## 2. Socket Event Contract

All event names come from `EVENTS` in `libs/shared/src/index.ts`. Never use raw strings.

### Client → Server

| Event | Payload | When |
|---|---|---|
| `joinRoom` | `{ username: string }` | Immediately after socket connects (or when username becomes available) |
| `addToQueue` | `{ url: string, username: string }` | User submits a song |
| `skipSong` | `{ username: string }` | User skips the current song (only works if they added it) |
| `removeFromQueue` | `{ songId: string, username: string }` | User removes one of their queued songs |
| `moveToTop` | `{ songId: string, username: string }` | Move one of their songs to the front of their personal queue |
| `moveToBottom` | `{ songId: string, username: string }` | Move one of their songs to the back of their personal queue |

### Server → Client

| Event | Payload | Scope |
|---|---|---|
| `roomState` | `RoomStateWithElapsed` | Joining client only |
| `songStarted` | `RoomState` | All connected clients |
| `queueUpdated` | `RoomState` | All connected clients |
| `downloadStatus` | `DownloadStatus` | All clients (errors only to submitter) |

---

## 3. User Flows

---

### 3.1 First Open — Username Modal

**Trigger:** User navigates to the app URL.

```
Browser loads page.tsx
    │
    ├── useEffect checks localStorage["listenroom_username"]
    │       └── if missing → show UsernameModal (blocks UI)
    │
    │   User types name → clicks Join
    │       └── localStorage.setItem("listenroom_username", name)
    │       └── setUsername(name)
    │
    └── useSocket(username) runs
            └── joinRoom is emitted with { username }
                └── server sends back roomState
```

The username is stored in localStorage. On return visits the modal is skipped. The user can click their name in the header to change it (clears localStorage, shows modal again).

---

### 3.2 Joining the Room (Initial Sync)

**Trigger:** Socket connects and `joinRoom` is emitted.

The frontend has two `useEffect`s to handle race conditions:

1. **If socket connects before username is set** — nothing is emitted until username arrives.
2. **If username is set before socket connects** — `joinRoom` is emitted inside the `connect` handler.
3. **If both are ready at mount time** — emits immediately via the already-connected check.

```
[Browser]                                    [NestJS]
    |                                            |
    | socket.emit("joinRoom", { username }) ---->|
    |                                            | RoomService.getRoomState()
    |                                            | computes elapsed = (Date.now() - startedAt) / 1000
    |<--- socket.emit("roomState", state) -------|  (to this client only)
    |                                            |
```

**Frontend response to `roomState`:**

- Sets `currentSong`, `queue`, `userQueues` in React state.
- If a song is playing:
  - Sets `audio.src = /audio/{fileId}.mp3`
  - Waits for `loadedmetadata`, then seeks to `elapsed` and calls `.play()`
  - Records `pendingSyncRef = { elapsed, capturedAt: Date.now() }` so if autoplay is blocked, the seek offset adjusts for time that passed while waiting for the user to interact

**Autoplay block handling:**
If `.play()` is rejected, event listeners are attached to `document` for `click` and `keydown`. On the first interaction, the audio seeks to the corrected position (`elapsed + timePassedSinceCapture`) and plays.

---

### 3.3 Adding a Song

**Trigger:** User types a URL or search term into SearchBox and hits Add.

```
[SearchBox]         [useRoomState]              [NestJS]
    |                     |                         |
    | User submits         |                         |
    | if starts "http" → use as-is                  |
    | else → "ytsearch1:{query}"                    |
    |                     |                         |
    | onAdd(url) -------->|                         |
    |                     | emit("addToQueue",       |
    |                     |  { url, username }) ---->|
    |                     |                         |
    |                     |         broadcast downloadStatus { status: 'downloading', progress: 0 }
    |<--------------------------------------------- | → all clients
    |                     |                         |
    | [pulsing violet dot]|                         | spawn yt-dlp child process
    |                     |                         |
    |                     |         broadcast downloadStatus { status: 'downloading', progress: 42.3 }
    |<--------------------------------------------- | → all clients
    |                     |                         |
    |                     |                         | yt-dlp exits 0
    |                     |                         | QueueItem created, MP3 on disk
    |                     |                         | meta cache saved
    |                     |                         |
    |                     |         broadcast downloadStatus { status: 'done', item }
    |<--------------------------------------------- | → all clients
    |                     |                         |
    |                     |                         | RoomService.enqueue(item)
    |                     |                         |   → adds to user's personal queue
    |                     |                         |   → adds user to round-robin if not present
    |                     |                         |   → if nothing playing → advanceSong()
    |                     |                         |
    |                     |         broadcast queueUpdated { currentSong, queue, userQueues }
    |<--------------------------------------------- | → all clients
```

**Cache hit:** If `audio-cache/{fileId}.mp3` exists on disk AND the fileId is in `metaCache`, yt-dlp is skipped entirely. The `QueueItem` is returned instantly.

**Error:** yt-dlp failure emits `downloadStatus { status: 'error', message }` only to the submitting client. All other clients are unaffected.

---

### 3.4 Round-Robin Queue Mechanics

The queue is not a simple FIFO. Each user has a **personal queue** (their own backlog), and the room's playback queue is one slot per user, taken in rotation order.

**Data structures on the server:**
- `userQueues: Map<string, QueueItem[]>` — full personal backlog, keyed by username
- `userOrder: string[]` — rotation order (order users first added a song)

**How `enqueue(item)` works:**
1. Append item to `userQueues[username]`
2. Add `username` to `userOrder` if not already present
3. `rebuildPublicState()`: `queue` = the first item from each user in rotation order

**How `advanceSong()` works:**
1. Shift the first `username` from `userOrder`
2. Shift their first song from `userQueues[username]`
3. Set that song as `currentSong`, record `startedAt = Date.now()`
4. If the user still has more songs, push them back to the end of `userOrder`
5. If the user has no more songs, delete them from `userQueues`
6. Rebuild public state, emit `room.songAdvanced` event → gateway broadcasts `songStarted`
7. Schedule `setTimeout(advanceSong, duration * 1000)`

**Example rotation:**

```
alice adds: Song A1, Song A2
bob adds:   Song B1
charlie adds: Song C1

Initial rotation: [alice, bob, charlie]

Playing: A1 (alice's turn)
Up Next: [B1 (bob), C1 (charlie)]   ← one slot per user

After A1 ends → alice goes back to end of rotation (she still has A2)
Rotation: [bob, charlie, alice]

Playing: B1
Up Next: [C1, A2]

After B1 ends → bob is removed (no more songs)
Rotation: [charlie, alice]

Playing: C1
Up Next: [A2]

After C1 ends → charlie removed
Rotation: [alice]

Playing: A2
Up Next: []
```

---

### 3.5 Song Auto-Advances

**Trigger:** `setTimeout` fires in `RoomService` after the current song's duration.

```
[RoomService — server]                    [All Clients]
    |                                          |
    | setTimeout fires                         |
    | advanceSong()                            |
    |   → pops next from round-robin           |
    |   → sets currentSong, startedAt          |
    |   → emits internal "room.songAdvanced"   |
    |   → schedules next setTimeout            |
    |                                          |
    | RoomGateway.handleSongAdvanced:          |
    | server.emit("songStarted", state) ------>|
    |                                          |
    |              useAudioPlayer.onSongStarted:
    |              audio.src = /audio/{fileId}.mp3
    |              audio.currentTime = 0
    |              audio.play()               |
```

If the queue is empty, `currentSong` is set to null and audio is paused / src cleared.

---

### 3.6 Skip Song

**Trigger:** User clicks "Skip →" in NowPlaying (only visible if they added the current song).

```
[NowPlaying]    [useRoomState]        [NestJS]
    |                |                    |
    | onSkip() ----->|                    |
    |                | emit("skipSong",   |
    |                |  { username }) --->|
    |                |                    |
    |                |    if current.addedBy !== username → do nothing (enforced server-side)
    |                |                    |
    |                |    RoomService.advanceSong()
    |                |       (same path as auto-advance)
```

Skip is **restricted to the song's owner**. The gateway checks `current.addedBy !== data.username` and returns early if there's a mismatch. Anyone can see their own song's skip button, but no one can skip someone else's song.

---

### 3.7 Personal Queue Management

**Trigger:** User clicks remove/move buttons in their PersonalQueue panel.

All mutations only affect the user's personal queue. The `username` in the payload is matched server-side — you cannot mutate another user's queue.

**Remove a song:**
- `socket.emit("removeFromQueue", { songId, username })`
- Server: removes from `userQueues[username]`, removes user from `userOrder` if queue becomes empty
- Broadcasts `queueUpdated` to all clients

**Move to top:**
- `socket.emit("moveToTop", { songId, username })`
- Server: moves song to front of `userQueues[username]`
- `rebuildPublicState()` updates the room queue preview
- Broadcasts `queueUpdated`

**Move to bottom:**
- Same as move to top but pushes to end.

---

### 3.8 Join Mid-Song (Sync)

**Trigger:** User opens the app while a song is already playing.

```
[New Browser]                          [NestJS]
    |                                      |
    | emit("joinRoom", { username }) ----->|
    |                                      |
    |              elapsed = (Date.now() - state.startedAt) / 1000
    |                                      |
    |<-- emit("roomState", {               |
    |      currentSong, startedAt,         |
    |      queue, userQueues,              |
    |      elapsed: 73.4 }) --------------|
    |                                      |
    | audio.src = /audio/{fileId}.mp3      |
    | wait for loadedmetadata              |
    | audio.currentTime = 73.4           |
    | audio.play()                        |
    |                                      |
    | [User is in sync with the room]      |
```

The server's `Date.now()` is the single clock. Because all clients stream the same MP3 and seek to the same offset, they play in sync with no peer-to-peer coordination.

---

### 3.9 Reconnect

**Trigger:** Network drop, tab sleep, or server restart.

Socket.io reconnects automatically. On reconnect, `useSocket` re-emits `joinRoom` inside the `connect` handler, which triggers a fresh `roomState` response. The audio player picks it up via `onRoomState` and re-syncs the audio position.

If the server restarted, state is **restored from the snapshot** (see §4). The user re-syncs to the recovered state.

---

### 3.10 Stall Recovery

If the `<audio>` element fires `stalled` or `error`:
- Up to 3 retries: reload the same `audio.src`, seek back to `currentTime`, call `play()`
- After 3 failures, gives up silently

---

## 4. State Persistence (Snapshot)

The server writes a snapshot of its full state to disk shortly after every change (500ms debounce). On startup, it reads the snapshot back.

**Files (dev):**
- `apps/api/.dev-state/room-state.json` — queue state, user queues, rotation order
- `apps/api/.dev-state/meta-cache.json` — fileId → title/duration metadata

**Files (Docker):**
Controlled by `process.env.STATE_DIR`. In the default Docker setup this is set to `/app/.dev-state` (inside the container). The audio-cache volume is separate and persists MP3 files.

**On startup:**
1. Read `room-state.json`
2. Restore `userQueues`, `userOrder`, `currentSong`, `queue`, `startedAt`
3. If a song was playing:
   - Calculate remaining time: `duration - (Date.now() - startedAt) / 1000`
   - If remaining ≤ 0 → call `advanceSong()` immediately (skip stale song)
   - If remaining > 0 → set timer for that many seconds

**On shutdown:**
Flush snapshot synchronously before process exits.

---

## 5. Audio Delivery

`AudioController` (`GET /audio/:fileId.mp3`) handles all audio requests:
- Reads `apps/api/audio-cache/{fileId}.mp3`
- Sets `X-Accel-Buffering: no` to prevent Caddy/nginx from buffering the whole file
- Supports full HTTP 206 range requests (essential for `audio.currentTime` seeking)
- Returns 404 if the file doesn't exist

---

## 6. State Ownership

| State | Owner | Where |
|---|---|---|
| `currentSong` | `RoomService` | In-memory + snapshot |
| `startedAt` | `RoomService` | In-memory + snapshot |
| `queue` (round-robin preview) | `RoomService` | Derived from userQueues |
| `userQueues` (per-user backlog) | `RoomService` | In-memory + snapshot |
| `userOrder` (rotation) | `RoomService` | In-memory + snapshot |
| `metaCache` (title/duration) | `QueueService` | In-memory + JSON file |
| MP3 files | Filesystem | `audio-cache/` |
| `username` | Browser | `localStorage` |
| React state (currentSong, queue, etc.) | `useRoomState` | React state |
| Socket connection | `lib/socket.ts` | Module singleton |
| Audio element | `useAudioPlayer` | React ref |
