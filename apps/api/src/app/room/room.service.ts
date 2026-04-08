import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { QueueItem, RoomState } from '@listenroom/shared'

const FALLBACK_DURATION_SECONDS = 180

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name)

  // Each user's personal song queue
  private userQueues = new Map<string, QueueItem[]>()
  // Round-robin rotation order (one entry per active user)
  private userOrder: string[] = []

  private state: RoomState = {
    currentSong: null,
    startedAt: null,
    queue: [],
  }

  private advanceTimer: NodeJS.Timeout | null = null

  constructor(private readonly eventEmitter: EventEmitter2) {}

  getRoomState(): RoomState & { elapsed: number | null } {
    const elapsed =
      this.state.startedAt !== null
        ? (Date.now() - this.state.startedAt) / 1000
        : null
    return { ...this.state, elapsed }
  }

  enqueue(item: QueueItem): void {
    const username = item.addedBy

    this.logger.log(`[enqueue] BEFORE — rotation: [${this.userOrder.join(', ')}] | queue: [${this.state.queue.map(q => q.addedBy).join(', ')}]`)

    if (!this.userQueues.has(username)) {
      this.userQueues.set(username, [])
    }
    this.userQueues.get(username)!.push(item)

    // Add to rotation only if not already present
    if (!this.userOrder.includes(username)) {
      this.userOrder.push(username)
    }

    // One slot per user in the displayed queue
    this.state.queue = this.userOrder.map(u => this.userQueues.get(u)![0])

    this.logger.log(`[enqueue] AFTER  — rotation: [${this.userOrder.join(', ')}] | queue: [${this.state.queue.map(q => q.addedBy).join(', ')}] | ${username} personal: ${this.userQueues.get(username)!.length} song(s)`)

    if (!this.state.currentSong) {
      this.advanceSong()
    }
  }

  advanceSong(): void {
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer)
      this.advanceTimer = null
    }

    if (this.userOrder.length === 0) {
      this.state.currentSong = null
      this.state.startedAt = null
      this.state.queue = []
      this.logger.log('Queue empty — nothing to play')
      this.eventEmitter.emit('room.songAdvanced', { ...this.state })
      return
    }

    this.logger.log(`[advance] BEFORE — rotation: [${this.userOrder.join(', ')}] | queue: [${this.state.queue.map(q => q.addedBy).join(', ')}]`)

    // Take the next user in rotation
    const username = this.userOrder.shift()!
    const userQueue = this.userQueues.get(username)!
    const next = userQueue.shift()!

    // Keep user in rotation if they still have songs, otherwise drop them
    if (userQueue.length > 0) {
      this.userOrder.push(username)
    } else {
      this.userQueues.delete(username)
    }

    this.state.currentSong = next
    this.state.startedAt = Date.now()
    this.state.queue = this.userOrder.map(u => this.userQueues.get(u)![0])

    this.logger.log(`[advance] AFTER  — now playing: "${next.title}" by ${username} | rotation: [${this.userOrder.join(', ')}] | queue: [${this.state.queue.map(q => q.addedBy).join(', ')}]`)

    this.eventEmitter.emit('room.songAdvanced', { ...this.state })

    const duration = next.duration > 0 ? next.duration : FALLBACK_DURATION_SECONDS
    this.advanceTimer = setTimeout(() => {
      this.advanceSong()
    }, duration * 1000)
  }
}
