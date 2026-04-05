'use client'

import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type { QueueItem, DownloadStatus, RoomStatePayload, RoomState } from '@listenroom/shared'
import { EVENTS } from '@listenroom/shared'

export function useRoom() {
  const socketRef = useRef<Socket | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [currentSong, setCurrentSong] = useState<QueueItem | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [downloadStatuses, setDownloadStatuses] = useState<DownloadStatus[]>([])
  const [connected, setConnected] = useState(false)

  // If autoplay is blocked, resume on the next user interaction anywhere on the page
  const resumeOnInteraction = () => {
    audioRef.current?.play().then(() => {
      document.removeEventListener('click', resumeOnInteraction)
      document.removeEventListener('keydown', resumeOnInteraction)
    }).catch(() => {})
  }

  const tryPlay = () => {
    audioRef.current?.play().catch(() => {
      document.addEventListener('click', resumeOnInteraction)
      document.addEventListener('keydown', resumeOnInteraction)
    })
  }

  useEffect(() => {
    const backendUrl = `http://${window.location.hostname}:4000`
    const socket = io(backendUrl)
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit(EVENTS.JOIN_ROOM)
    })

    socket.on('disconnect', () => setConnected(false))

    socket.on(EVENTS.ROOM_STATE, (state: RoomStatePayload) => {
      setCurrentSong(state.currentSong)
      setQueue(state.queue)

      if (state.currentSong && state.elapsed !== null && audioRef.current) {
        audioRef.current.src = `/audio/${state.currentSong.fileId}.mp3`
        audioRef.current.currentTime = state.elapsed
        tryPlay()
      }
    })

    socket.on(EVENTS.SONG_STARTED, (state: RoomState) => {
      setCurrentSong(state.currentSong)
      setQueue(state.queue)

      if (state.currentSong && audioRef.current) {
        audioRef.current.src = `/audio/${state.currentSong.fileId}.mp3`
        audioRef.current.currentTime = 0
        tryPlay()
      }
    })

    socket.on(EVENTS.QUEUE_UPDATED, (state: RoomState) => {
      setCurrentSong(state.currentSong)
      setQueue(state.queue)
    })

    socket.on(EVENTS.DOWNLOAD_STATUS, (status: DownloadStatus) => {
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
