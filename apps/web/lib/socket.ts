'use client'
import { io, type Socket } from 'socket.io-client'

let _socket: Socket | null = null

export function getSocket(): Socket {
  if (typeof window === 'undefined') throw new Error('getSocket() called on server')
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const url = isLocal ? 'http://localhost:4000' : window.location.origin
  if (!_socket) _socket = io(url)
  return _socket
}
