import { QueueItem } from '@listenroom/shared'

// These fileIds match the trimmed MP3s in apps/api/test-cache/
// Duration is 15s (matching the trimmed files)
export const SONG_A: QueueItem = {
  id: 'test-id-song-a',
  title: 'Test Song A',
  duration: 15,
  fileId: 'cf7142b9a741',
  sourceUrl: 'https://example.com/song-a',
  addedBy: 'alice',
}

export const SONG_B: QueueItem = {
  id: 'test-id-song-b',
  title: 'Test Song B',
  duration: 15,
  fileId: '7deba2a7fdb3',
  sourceUrl: 'https://example.com/song-b',
  addedBy: 'bob',
}

export const SONG_C: QueueItem = {
  id: 'test-id-song-c',
  title: 'Test Song C',
  duration: 15,
  fileId: '515964f19c30',
  sourceUrl: 'https://example.com/song-c',
  addedBy: 'charlie',
}

export function makeSong(overrides: Partial<QueueItem> & { addedBy: string }): QueueItem {
  return {
    id: `test-id-${Math.random().toString(36).slice(2)}`,
    title: `Song by ${overrides.addedBy}`,
    duration: 15,
    fileId: 'cf7142b9a741',
    sourceUrl: 'https://example.com/generic',
    ...overrides,
  }
}
