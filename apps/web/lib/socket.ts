'use client'
import { io, type Socket } from 'socket.io-client'

let _socket: Socket | null = null

export function getSocket(): Socket {
  if (typeof window === 'undefined') throw new Error('getSocket() called on server')
  if (!_socket) _socket = io(`http://${window.location.hostname}:4000`)
  return _socket
}
