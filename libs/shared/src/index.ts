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
  SKIP_SONG: 'skipSong',

  // Server → Client
  ROOM_STATE: 'roomState',           // sent only to the joining client
  SONG_STARTED: 'songStarted',       // broadcast to all when song changes
  QUEUE_UPDATED: 'queueUpdated',     // broadcast to all when queue changes
  DOWNLOAD_STATUS: 'downloadStatus', // broadcast progress/errors
} as const

// ─── Socket Payload Types ─────────────────────────────────────────────────────

export interface AddToQueuePayload {
  url: string
}

export type RoomStatePayload = RoomStateWithElapsed

export type SongStartedPayload = RoomState

export type QueueUpdatedPayload = RoomState

export type DownloadStatusPayload = DownloadStatus
