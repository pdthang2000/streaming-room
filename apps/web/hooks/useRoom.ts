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
    searchResults,
    searchLoading,
    addToQueue,
    skipSong,
    removeFromQueue,
    moveToTop,
    moveToBottom,
    search,
    clearSearchResults,
  } = useRoomState(username)

  return {
    currentSong,
    queue,
    userQueues,
    downloadStatuses,
    searchResults,
    searchLoading,
    audioRef,
    addToQueue,
    skipSong,
    removeFromQueue,
    moveToTop,
    moveToBottom,
    search,
    clearSearchResults,
    connected,
    currentTime,
  }
}
