'use client'
import { useSocket } from './useSocket'
import { useAudioPlayer } from './useAudioPlayer'
import { useRoomState } from './useRoomState'

export function useRoom(username: string | null) {
  const { connected } = useSocket(username)
  const { audioRef, currentTime } = useAudioPlayer()
  const { currentSong, queue, downloadStatuses, addToQueue, skipSong } = useRoomState(username)

  return { currentSong, queue, downloadStatuses, audioRef, addToQueue, skipSong, connected, currentTime }
}
