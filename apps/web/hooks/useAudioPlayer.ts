'use client'
import { useEffect, useRef, useState } from 'react'
import { getSocket } from '../lib/socket'
import { EVENTS, type RoomStatePayload, type RoomState } from '@listenroom/shared'

const MAX_STALL_RETRIES = 3

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stallRetriesRef = useRef(0)
  const pendingSyncRef = useRef<{ elapsed: number; capturedAt: number } | null>(null)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const backendUrl = isLocal ? 'http://localhost:4000' : ''
    const audioUrl = (fileId: string) => `${backendUrl}/audio/${fileId}.mp3`
    const socket = getSocket()
    const audio = audioRef.current

    // ── Autoplay handling ─────────────────────────────────────────────────────
    const resumeOnInteraction = () => {
      if (!audioRef.current) return
      if (pendingSyncRef.current) {
        const { elapsed, capturedAt } = pendingSyncRef.current
        audioRef.current.currentTime = elapsed + (Date.now() - capturedAt) / 1000
        pendingSyncRef.current = null
      }
      audioRef.current.play().then(() => {
        document.removeEventListener('click', resumeOnInteraction)
        document.removeEventListener('keydown', resumeOnInteraction)
      }).catch(() => {})
    }

    const tryPlay = () => {
      audioRef.current?.play().then(() => {
        pendingSyncRef.current = null
      }).catch(() => {
        document.addEventListener('click', resumeOnInteraction)
        document.addEventListener('keydown', resumeOnInteraction)
      })
    }

    // ── Stall recovery ────────────────────────────────────────────────────────
    const recoverAudio = () => {
      const a = audioRef.current
      if (!a || a.ended || a.paused) return
      if (stallRetriesRef.current >= MAX_STALL_RETRIES) {
        console.warn('[audio] stalled/error — max retries reached, giving up')
        return
      }
      stallRetriesRef.current += 1
      console.warn(`[audio] stalled/error — retrying (attempt ${stallRetriesRef.current}/${MAX_STALL_RETRIES}) from ${a.currentTime.toFixed(2)}s`)
      const resumeAt = a.currentTime
      const src = a.src
      a.addEventListener('loadedmetadata', () => { a.currentTime = resumeAt; tryPlay() }, { once: true })
      a.src = src
      a.load()
    }

    // ── Audio element listeners ───────────────────────────────────────────────
    const handleTimeUpdate = () => setCurrentTime(audioRef.current?.currentTime ?? 0)
    const handlePlaying = () => {
      if (stallRetriesRef.current > 0) {
        console.log(`[audio] recovered after ${stallRetriesRef.current} retry(s)`)
        stallRetriesRef.current = 0
      }
    }
    const handleError = () => {
      console.error('[audio] error code:', audio?.error?.code, audio?.error?.message)
      recoverAudio()
    }

    if (audio) {
      audio.addEventListener('stalled', recoverAudio)
      audio.addEventListener('error', handleError)
      audio.addEventListener('timeupdate', handleTimeUpdate)
      audio.addEventListener('playing', handlePlaying)
    }

    // ── Socket: sync audio on join/reconnect ──────────────────────────────────
    const onRoomState = (state: RoomStatePayload) => {
      console.log('[audio] room_state — song:', state.currentSong?.title ?? 'none', '| elapsed:', state.elapsed?.toFixed(2) ?? 'n/a')
      if (!state.currentSong || state.elapsed === null || !audioRef.current) return
      const a = audioRef.current
      const elapsed = state.elapsed
      const newSrc = audioUrl(state.currentSong.fileId)
      if (!a.paused && !a.ended && a.src === newSrc) {
        console.log('[audio] room_state — already playing, skipping reload')
        return
      }
      a.addEventListener('loadedmetadata', () => {
        pendingSyncRef.current = { elapsed, capturedAt: Date.now() }
        a.currentTime = elapsed
        tryPlay()
      }, { once: true })
      a.src = newSrc
      a.load()
    }

    // ── Socket: load new song ─────────────────────────────────────────────────
    const onSongStarted = (state: RoomState) => {
      console.log('[audio] song_started — song:', state.currentSong?.title ?? 'none')
      if (!audioRef.current) return
      if (state.currentSong) {
        stallRetriesRef.current = 0
        setCurrentTime(0)
        audioRef.current.src = audioUrl(state.currentSong.fileId)
        audioRef.current.currentTime = 0
        tryPlay()
      } else {
        console.log('[audio] queue empty — stopping playback')
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }

    socket.on(EVENTS.ROOM_STATE, onRoomState)
    socket.on(EVENTS.SONG_STARTED, onSongStarted)

    return () => {
      if (audio) {
        audio.removeEventListener('stalled', recoverAudio)
        audio.removeEventListener('error', handleError)
        audio.removeEventListener('timeupdate', handleTimeUpdate)
        audio.removeEventListener('playing', handlePlaying)
      }
      document.removeEventListener('click', resumeOnInteraction)
      document.removeEventListener('keydown', resumeOnInteraction)
      socket.off(EVENTS.ROOM_STATE, onRoomState)
      socket.off(EVENTS.SONG_STARTED, onSongStarted)
    }
  }, [])

  return { audioRef, currentTime }
}
