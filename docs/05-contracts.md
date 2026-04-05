# 05 — Contracts (Shared Types & Socket Events)

This is the single source of truth for all data structures and event names.
Implement this in `libs/shared/src/index.ts` before writing any app code.

Both `apps/web` and `apps/api` import ONLY from `@listenroom/shared`.
Never duplicate these types in either app.

---

## `libs/shared/src/index.ts`

```ts
// ─── Domain Types ────────────────────────────────────────────────────────────

export interface QueueItem {
  id: string           // uuid v4
  title: string        // extracted by yt-dlp
  duration: number     // seconds (integer)
  fileId: string       // MD5 hash prefix of sourceUrl — used in /audio/:fileId.mp3
  sourceUrl: string    // original URL or ytsearch1:... query
  addedBy: string      // socket.id of the user who added it
}

export interface RoomState {
  currentSong: QueueItem | null
  startedAt: number | null      // Date.now() timestamp, or null if nothing playing
  queue: QueueItem[]            // upcoming songs, ordered
}

// RoomState extended with server-calculated elapsed — sent on joinRoom only
export interface RoomStateWithElapsed extends RoomState {
  elapsed: number | null        // seconds since currentSong started, or null
}

// ─── Download Status ──────────────────────────────────────────────────────────

export type DownloadStatusType = 'pending' | 'downloading' | 'done' | 'error'

export interface DownloadStatus {
  url: string                   // the sourceUrl submitted
  status: DownloadStatusType
  progress?: number             // 0–100, present when status is 'downloading'
  message?: string              // error message, present when status is 'error'
  item?: QueueItem              // present when status is 'done'
}

// ─── Socket Event Names ───────────────────────────────────────────────────────
// Use these constants everywhere — never hardcode event name strings

export const EVENTS = {
  // Client → Server
  JOIN_ROOM: 'joinRoom',
  ADD_TO_QUEUE: 'addToQueue',

  // Server → Client
  ROOM_STATE: 'roomState',         // sent only to the joining client
  SONG_STARTED: 'songStarted',     // broadcast to all when song changes
  QUEUE_UPDATED: 'queueUpdated',   // broadcast to all when queue changes
  DOWNLOAD_STATUS: 'downloadStatus', // broadcast progress/errors
} as const

// ─── Socket Payload Types ─────────────────────────────────────────────────────

// Client emits this when adding a song
export interface AddToQueuePayload {
  url: string   // YouTube URL, SoundCloud URL, or plain search string
}

// Server emits this to a newly joined client
export type RoomStatePayload = RoomStateWithElapsed

// Server broadcasts this when a new song starts
export type SongStartedPayload = RoomState

// Server broadcasts this when queue changes
export type QueueUpdatedPayload = RoomState

// Server broadcasts download feedback
export type DownloadStatusPayload = DownloadStatus
```

---

## Path Alias

After generating the shared lib with Nx, the path alias `@listenroom/shared`
is automatically configured in `tsconfig.base.json`. Verify it looks like:

```json
{
  "compilerOptions": {
    "paths": {
      "@listenroom/shared": ["libs/shared/src/index.ts"]
    }
  }
}
```

---

## Usage in Backend (NestJS)

```ts
import { QueueItem, RoomState, EVENTS } from '@listenroom/shared'
```

## Usage in Frontend (Next.js)

```ts
import type { QueueItem, RoomState, DownloadStatus } from '@listenroom/shared'
import { EVENTS } from '@listenroom/shared'
```

---

## Design Constraints

- `fileId` is always 12 hex characters (first 12 chars of MD5 hex of sourceUrl)
- `duration` is always a positive integer; default to `180` if yt-dlp returns 0 or NaN
- `addedBy` is the socket.id string — no display name system for now
- `startedAt` is a Unix timestamp in **milliseconds** (Date.now())
- `elapsed` is in **seconds** (float) — the client uses it for `audio.currentTime`