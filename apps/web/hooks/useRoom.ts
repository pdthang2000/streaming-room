'use client'
import { useSocket } from './useSocket'
import { useAudioPlayer } from './useAudioPlayer'
import { useRoomState } from './useRoomState'

export function useRoom(username: string | null) {
  const { connected } = useSocket(username)
  const { audioRef, currentTime } = useAudioPlayer()
  const {
    currentSong,
    queue,
    userQueues,
    downloadStatuses,
    addToQueue,
    skipSong,
    removeFromQueue,
    moveToTop,
    moveToBottom,
  } = useRoomState(username)

  return {
    currentSong,
    queue,
    userQueues,
    downloadStatuses,
    audioRef,
    addToQueue,
    skipSong,
    removeFromQueue,
    moveToTop,
    moveToBottom,
    connected,
    currentTime,
  }
}
