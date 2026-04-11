'use client'
import { useEffect, useState } from 'react'
import { getSocket } from '../lib/socket'
import { EVENTS, type QueueItem, type DownloadStatus, type RoomState, type RoomStatePayload } from '@listenroom/shared'

export function useRoomState(username: string | null) {
  const [currentSong, setCurrentSong] = useState<QueueItem | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [userQueues, setUserQueues] = useState<Record<string, QueueItem[]>>({})
  const [downloadStatuses, setDownloadStatuses] = useState<DownloadStatus[]>([])

  useEffect(() => {
    const socket = getSocket()

    const applyState = (state: RoomState) => {
      setCurrentSong(state.currentSong)
      setQueue(state.queue)
      setUserQueues(state.userQueues ?? {})
    }

    const onRoomState = (state: RoomStatePayload) => applyState(state)
    const onSongStarted = (state: RoomState) => applyState(state)
    const onQueueUpdated = (state: RoomState) => {
      console.log('[socket] queue_updated — queue length:', state.queue.length)
      applyState(state)
    }
    const onDownloadStatus = (status: DownloadStatus) => {
      console.log(`[socket] download_status — ${status.status}${status.progress != null ? ` ${status.progress.toFixed(0)}%` : ''}`, status.url)
      setDownloadStatuses(prev => {
        const idx = prev.findIndex(s => s.url === status.url)
        if (idx >= 0) { const next = [...prev]; next[idx] = status; return next }
        return [...prev, status]
      })
      if (status.status === 'done' || status.status === 'error') {
        setTimeout(() => setDownloadStatuses(prev => prev.filter(s => s.url !== status.url)), 3000)
      }
    }

    socket.on(EVENTS.ROOM_STATE, onRoomState)
    socket.on(EVENTS.SONG_STARTED, onSongStarted)
    socket.on(EVENTS.QUEUE_UPDATED, onQueueUpdated)
    socket.on(EVENTS.DOWNLOAD_STATUS, onDownloadStatus)

    return () => {
      socket.off(EVENTS.ROOM_STATE, onRoomState)
      socket.off(EVENTS.SONG_STARTED, onSongStarted)
      socket.off(EVENTS.QUEUE_UPDATED, onQueueUpdated)
      socket.off(EVENTS.DOWNLOAD_STATUS, onDownloadStatus)
    }
  }, [])

  const addToQueue = (url: string) => {
    getSocket().emit(EVENTS.ADD_TO_QUEUE, { url, username: username ?? 'anonymous' })
  }
  const skipSong = () => getSocket().emit(EVENTS.SKIP_SONG)
  const removeFromQueue = (songId: string) =>
    getSocket().emit(EVENTS.REMOVE_FROM_QUEUE, { songId, username: username ?? 'anonymous' })
  const moveToTop = (songId: string) =>
    getSocket().emit(EVENTS.MOVE_TO_TOP, { songId, username: username ?? 'anonymous' })
  const moveToBottom = (songId: string) =>
    getSocket().emit(EVENTS.MOVE_TO_BOTTOM, { songId, username: username ?? 'anonymous' })

  return {
    currentSong,
    queue,
    userQueues,
    downloadStatuses,
    addToQueue,
    skipSong,
    removeFromQueue,
    moveToTop,
    moveToBottom,
  }
}
