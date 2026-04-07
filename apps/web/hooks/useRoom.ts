'use client'

import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type { QueueItem, DownloadStatus, RoomStatePayload, RoomState } from '@listenroom/shared'
import { EVENTS } from '@listenroom/shared'

const MAX_STALL_RETRIES = 3

export function useRoom() {
  const socketRef = useRef<Socket | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stallRetriesRef = useRef(0)
  // Tracks the server-reported elapsed time and when we captured it, so we can
  // re-seek accurately if autoplay is blocked and the user takes time to click.
  const pendingSyncRef = useRef<{ elapsed: number; capturedAt: number } | null>(null)
  const [currentSong, setCurrentSong] = useState<QueueItem | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [downloadStatuses, setDownloadStatuses] = useState<DownloadStatus[]>([])
  const [connected, setConnected] = useState(false)

  // If autoplay is blocked, resume on the next user interaction anywhere on the page
  const resumeOnInteraction = () => {
    const audio = audioRef.current
    if (!audio) return

    // Re-seek to compensate for time elapsed while waiting for user interaction
    if (pendingSyncRef.current) {
      const { elapsed, capturedAt } = pendingSyncRef.current
      audio.currentTime = elapsed + (Date.now() - capturedAt) / 1000
      pendingSyncRef.current = null
    }

    audio.play().then(() => {
      document.removeEventListener('click', resumeOnInteraction)
      document.removeEventListener('keydown', resumeOnInteraction)
    }).catch(() => {})
  }

  const tryPlay = () => {
    audioRef.current?.play().then(() => {
      // Autoplay succeeded — no deferred sync needed
      pendingSyncRef.current = null
    }).catch(() => {
      document.addEventListener('click', resumeOnInteraction)
      document.addEventListener('keydown', resumeOnInteraction)
    })
  }

  useEffect(() => {
    const backendUrl = `http://${window.location.hostname}:4000`
    const socket = io(backendUrl)
    socketRef.current = socket

    const audioUrl = (fileId: string) => `${backendUrl}/audio/${fileId}.mp3`

    // ── Audio recovery ────────────────────────────────────────────────────────
    // If a proxy kills the stream mid-playback (stalled/error), reload the file
    // from the current position so playback resumes transparently.
    const recoverAudio = () => {
      const audio = audioRef.current
      if (!audio || audio.ended || audio.paused) return
      if (stallRetriesRef.current >= MAX_STALL_RETRIES) {
        console.warn('[audio] stalled/error — max retries reached, giving up')
        return
      }

      stallRetriesRef.current += 1
      console.warn(`[audio] stalled/error — retrying (attempt ${stallRetriesRef.current}/${MAX_STALL_RETRIES}) from ${audio.currentTime.toFixed(2)}s`)
      const resumeAt = audio.currentTime
      const src = audio.src

      audio.addEventListener('loadedmetadata', () => {
        audio.currentTime = resumeAt
        tryPlay()
      }, { once: true })

      audio.src = src
      audio.load()
    }

    const audio = audioRef.current
    if (audio) {
      audio.addEventListener('stalled', recoverAudio)
      audio.addEventListener('error', () => {
        console.error('[audio] error code:', audio.error?.code, audio.error?.message)
        recoverAudio()
      })
      // Reset retry counter whenever playback is progressing normally
      audio.addEventListener('playing', () => {
        if (stallRetriesRef.current > 0) {
          console.log(`[audio] recovered after ${stallRetriesRef.current} retry(s)`)
          stallRetriesRef.current = 0
        }
      })
    }

    // ── Socket events ─────────────────────────────────────────────────────────
    socket.on('connect', () => {
      console.log('[socket] connected:', socket.id)
      setConnected(true)
      socket.emit(EVENTS.JOIN_ROOM)
    })

    socket.on('disconnect', (reason: string) => {
      console.warn('[socket] disconnected:', reason)
      setConnected(false)
    })

    socket.on(EVENTS.ROOM_STATE, (state: RoomStatePayload) => {
      console.log('[socket] room_state — song:', state.currentSong?.title ?? 'none', '| elapsed:', state.elapsed?.toFixed(2) ?? 'n/a')
      setCurrentSong(state.currentSong)
      setQueue(state.queue)

      if (state.currentSong && state.elapsed !== null && audioRef.current) {
        const audio = audioRef.current
        const elapsed = state.elapsed
        const newSrc = audioUrl(state.currentSong.fileId)

        // Already playing the right song — don't interrupt
        if (!audio.paused && !audio.ended && audio.src === newSrc) {
          console.log('[socket] room_state — already playing, skipping reload')
          return
        }

        audio.addEventListener('loadedmetadata', () => {
          pendingSyncRef.current = { elapsed, capturedAt: Date.now() }
          audio.currentTime = elapsed
          tryPlay()
        }, { once: true })

        audio.src = newSrc
        audio.load()
      }
    })

    socket.on(EVENTS.SONG_STARTED, (state: RoomState) => {
      console.log('[socket] song_started — song:', state.currentSong?.title ?? 'none')
      setCurrentSong(state.currentSong)
      setQueue(state.queue)

      if (state.currentSong && audioRef.current) {
        stallRetriesRef.current = 0
        audioRef.current.src = audioUrl(state.currentSong.fileId)
        audioRef.current.currentTime = 0
        tryPlay()
      }
    })

    socket.on(EVENTS.QUEUE_UPDATED, (state: RoomState) => {
      console.log('[socket] queue_updated — queue length:', state.queue.length)
      setCurrentSong(state.currentSong)
      setQueue(state.queue)
    })

    socket.on(EVENTS.DOWNLOAD_STATUS, (status: DownloadStatus) => {
      console.log(`[socket] download_status — ${status.status}${status.progress != null ? ` ${status.progress.toFixed(0)}%` : ''}`, status.url)
      setDownloadStatuses((prev) => {
        const idx = prev.findIndex((s) => s.url === status.url)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = status
          return next
        }
        return [...prev, status]
      })

      if (status.status === 'done' || status.status === 'error') {
        setTimeout(() => {
          setDownloadStatuses((prev) => prev.filter((s) => s.url !== status.url))
        }, 3000)
      }
    })

    return () => {
      if (audio) {
        audio.removeEventListener('stalled', recoverAudio)
        audio.removeEventListener('error', recoverAudio)
      }
      document.removeEventListener('click', resumeOnInteraction)
      document.removeEventListener('keydown', resumeOnInteraction)
      socket.disconnect()
    }
  }, [])

  const addToQueue = (url: string) => {
    socketRef.current?.emit(EVENTS.ADD_TO_QUEUE, { url })
  }

  const skipSong = () => {
    socketRef.current?.emit(EVENTS.SKIP_SONG)
  }

  return { currentSong, queue, downloadStatuses, audioRef, addToQueue, skipSong, connected }
}
