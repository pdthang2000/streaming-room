// ─── Domain Types ────────────────────────────────────────────────────────────

export interface QueueItem {
  id: string           // uuid v4
  title: string        // extracted by yt-dlp
  duration: number     // seconds (integer)
  fileId: string       // MD5 hash prefix of sourceUrl — used in /audio/:fileId.mp3
  sourceUrl: string    // original URL or ytsearch1:... query
  addedBy: string      // display name of the user who added it
}

export interface RoomState {
  currentSong: QueueItem | null
  startedAt: number | null      // Date.now() timestamp, or null if nothing playing
  queue: QueueItem[]            // upcoming songs, ordered (one per user in rotation)
  userQueues: Record<string, QueueItem[]>  // full per-user backlog, keyed by username
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

// ─── Search Types ─────────────────────────────────────────────────────────────

export interface SearchResult {
  videoId: string
  title: string
  duration: number    // integer seconds; 0 = live/unknown
  thumbnail: string   // CDN URL
  uploader: string    // channel name
  url: string         // full watch URL — pass directly to addToQueue
}

export interface SearchPayload {
  query: string
  platform: 'youtube'   // extend union for future platforms
  limit?: number
}

export type SearchResultsPayload = SearchResult[]

// ─── Socket Event Names ───────────────────────────────────────────────────────
// Use these constants everywhere — never hardcode event name strings

export const EVENTS = {
  // Client → Server
  JOIN_ROOM: 'joinRoom',
  ADD_TO_QUEUE: 'addToQueue',
  SKIP_SONG: 'skipSong',
  REMOVE_FROM_QUEUE: 'removeFromQueue',
  MOVE_TO_TOP: 'moveToTop',
  MOVE_TO_BOTTOM: 'moveToBottom',
  SEARCH: 'search',

  // Server → Client
  ROOM_STATE: 'roomState',           // sent only to the joining client
  SONG_STARTED: 'songStarted',       // broadcast to all when song changes
  QUEUE_UPDATED: 'queueUpdated',     // broadcast to all when queue changes
  DOWNLOAD_STATUS: 'downloadStatus', // broadcast progress/errors
  SEARCH_RESULTS: 'searchResults',   // sent only to the requesting client
} as const

// ─── Socket Payload Types ─────────────────────────────────────────────────────

export interface JoinRoomPayload {
  username: string
}

export interface AddToQueuePayload {
  url: string
  username: string
}

export interface QueueMutationPayload {
  songId: string
  username: string
}

export interface SkipSongPayload {
  username: string
}

export type RoomStatePayload = RoomStateWithElapsed

export type SongStartedPayload = RoomState

export type QueueUpdatedPayload = RoomState

export type DownloadStatusPayload = DownloadStatus
