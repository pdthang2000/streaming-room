# 04 — Frontend (Next.js)

Build the Next.js frontend after the backend is running.
The frontend is a single page — no routing needed beyond `/`.

---

## Philosophy

The UI should feel like a **listening room**, not a music player.
- No play/pause button
- No seek bar
- No volume control (browser default handles this)
- Focus: what's playing, what's next, and a search box

---

## Component Tree

```
app/page.tsx
└── <RoomPage>
    ├── <NowPlaying />        ← current song title, a simple waveform or pulsing dot
    ├── <Queue />             ← list of upcoming songs
    ├── <SearchBox />         ← input + submit, shows download status
    └── <AudioPlayer />       ← hidden <audio> element, managed by useRoom hook
```

---

## Socket Hook — `hooks/useRoom.ts`

This is the most important piece of the frontend. It manages:
- Socket.io connection to the backend
- Room state (currentSong, queue, elapsed)
- Audio element synchronization

```ts
'use client'

import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type { RoomState, QueueItem, DownloadStatus } from '@listenroom/shared'

export function useRoom() {
  const socketRef = useRef<Socket | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [currentSong, setCurrentSong] = useState<QueueItem | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [downloadStatuses, setDownloadStatuses] = useState<DownloadStatus[]>([])

  useEffect(() => {
    const socket = io('http://localhost:4000')
    socketRef.current = socket

    socket.emit('joinRoom')

    // Initial state on join
    socket.on('roomState', (state: RoomState & { elapsed: number | null }) => {
      setCurrentSong(state.currentSong)
      setQueue(state.queue)
      if (state.currentSong && state.elapsed !== null && audioRef.current) {
        audioRef.current.src = `/audio/${state.currentSong.fileId}.mp3`
        audioRef.current.currentTime = state.elapsed
        audioRef.current.play().catch(() => {
          // Autoplay blocked — show a "Click to listen" button
        })
      }
    })

    // New song started
    socket.on('songStarted', (state: RoomState) => {
      setCurrentSong(state.currentSong)
      setQueue(state.queue)
      if (state.currentSong && audioRef.current) {
        audioRef.current.src = `/audio/${state.currentSong.fileId}.mp3`
        audioRef.current.currentTime = 0
        audioRef.current.play()
      }
    })

    // Queue updated (someone added a song)
    socket.on('queueUpdated', (state: RoomState) => {
      setCurrentSong(state.currentSong)
      setQueue(state.queue)
    })

    // Download feedback
    socket.on('downloadStatus', (status: DownloadStatus) => {
      setDownloadStatuses(prev => {
        const existing = prev.findIndex(s => s.url === status.url)
        if (existing >= 0) {
          const next = [...prev]
          next[existing] = status
          return next
        }
        return [...prev, status]
      })
      // Remove completed/errored statuses after 3 seconds
      if (status.status === 'done' || status.status === 'error') {
        setTimeout(() => {
          setDownloadStatuses(prev => prev.filter(s => s.url !== status.url))
        }, 3000)
      }
    })

    return () => { socket.disconnect() }
  }, [])

  const addToQueue = (url: string) => {
    socketRef.current?.emit('addToQueue', { url })
  }

  return { currentSong, queue, downloadStatuses, audioRef, addToQueue }
}
```

---

## Autoplay Policy Handling

Browsers block autoplay until the user has interacted with the page.
When `.play()` is rejected, show a subtle banner:

```tsx
const [needsInteraction, setNeedsInteraction] = useState(false)

audioRef.current.play().catch(() => setNeedsInteraction(true))

// In JSX:
{needsInteraction && (
  <button onClick={() => { audioRef.current?.play(); setNeedsInteraction(false) }}>
    Click to start listening
  </button>
)}
```

---

## SearchBox Component

Accept a URL or a plain search query.
If input doesn't start with `http`, prefix it with `ytsearch1:` — yt-dlp will
search YouTube and download the top result.

```ts
const handleSubmit = (input: string) => {
  const query = input.startsWith('http') ? input : `ytsearch1:${input}`
  addToQueue(query)
}
```

Show a loading indicator per song while `downloadStatuses` has a matching entry with `status: 'downloading'`.

---

## NowPlaying Component

Display:
- Song title
- A pulsing animated dot or simple CSS waveform to indicate live playback
- "Nothing playing yet" state when `currentSong` is null

Do NOT show:
- Progress bar
- Current timestamp
- Duration

---

## Queue Component

Simple ordered list of upcoming `QueueItem[]`.
Show title only. Empty state: "Queue is empty — add a song below."

---

## Hidden Audio Element

The `<audio>` element should be in the DOM but not visible.
Browser controls are disabled — we control it programmatically.

```tsx
<audio ref={audioRef} style={{ display: 'none' }} />
```

---

## Tailwind Layout

Single column, centered, max-width 640px.
Dark background recommended — it's a listening room, not a dashboard.

Suggested color palette:
- Background: `zinc-950`
- Card surfaces: `zinc-900`
- Accent / active: `violet-500`
- Text: `zinc-100` / `zinc-400`