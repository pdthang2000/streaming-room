'use client'
import { useEffect, useRef, useState } from 'react'
import { getSocket } from '../lib/socket'
import { EVENTS, type JoinRoomPayload } from '@listenroom/shared'

export function useSocket(username: string | null) {
  const [connected, setConnected] = useState(false)
  const usernameRef = useRef(username)

  // Case 1: socket connects after username is available
  useEffect(() => {
    const socket = getSocket()

    const onConnect = () => {
      setConnected(true)
      if (usernameRef.current) {
        socket.emit(EVENTS.JOIN_ROOM, { username: usernameRef.current } satisfies JoinRoomPayload)
      }
    }
    const onDisconnect = () => setConnected(false)

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)

    // If already connected when this effect runs, sync state and emit immediately
    if (socket.connected) {
      setConnected(true)
      if (usernameRef.current) {
        socket.emit(EVENTS.JOIN_ROOM, { username: usernameRef.current } satisfies JoinRoomPayload)
      }
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [])

  // Case 2: username becomes available after socket is already connected
  useEffect(() => {
    usernameRef.current = username
    const socket = getSocket()
    if (username && socket.connected) {
      socket.emit(EVENTS.JOIN_ROOM, { username } satisfies JoinRoomPayload)
    }
  }, [username])

  return { connected }
}
