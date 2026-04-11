import { Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { QueueItem, RoomState } from '@listenroom/shared'
import * as fs from 'fs'
import * as path from 'path'

const FALLBACK_DURATION_SECONDS = 180
const SNAPSHOT_DIR = process.env.STATE_DIR ?? path.resolve(process.cwd(), 'apps/api/.dev-state')
const SNAPSHOT_PATH = path.join(SNAPSHOT_DIR, 'room-state.json')

@Injectable()
export class RoomService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RoomService.name)

  // Each user's personal song queue
  private userQueues = new Map<string, QueueItem[]>()
  // Round-robin rotation order (one entry per active user)
  private userOrder: string[] = []

  private state: RoomState = {
    currentSong: null,
    startedAt: null,
    queue: [],
    userQueues: {},
  }

  private advanceTimer: NodeJS.Timeout | null = null
  private saveTimer: NodeJS.Timeout | null = null

  constructor(private readonly eventEmitter: EventEmitter2) {}

  onModuleInit(): void {
    this.loadSnapshot()
  }

  onApplicationShutdown(): void {
    this.flushSnapshot()
  }

  private loadSnapshot(): void {
    if (!fs.existsSync(SNAPSHOT_PATH)) return
    try {
      const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'))
      this.userQueues = new Map(Object.entries(snap.userQueues ?? {})) as Map<string, QueueItem[]>
      this.userOrder = snap.userOrder ?? []
      this.state = {
        currentSong: snap.state?.currentSong ?? null,
        startedAt: snap.state?.startedAt ?? null,
        queue: snap.state?.queue ?? [],
        userQueues: {},
      }
      this.rebuildPublicState()
      this.logger.log(
        `Restored snapshot — playing: "${this.state.currentSong?.title ?? 'nothing'}", upcoming: ${this.state.queue.length} song(s)`,
      )
      if (this.state.currentSong && this.state.startedAt) {
        const duration =
          this.state.currentSong.duration > 0
            ? this.state.currentSong.duration
            : FALLBACK_DURATION_SECONDS
        const elapsed = (Date.now() - this.state.startedAt) / 1000
        const remaining = duration - elapsed
        if (remaining <= 0) {
          this.logger.log('Song already ended during restart — advancing immediately')
          setImmediate(() => this.advanceSong())
        } else {
          this.logger.log(`Re-arming advance timer: ${remaining.toFixed(1)}s remaining`)
          this.advanceTimer = setTimeout(() => this.advanceSong(), remaining * 1000)
        }
      }
    } catch (err) {
      this.logger.warn(`Could not load snapshot (starting fresh): ${err}`)
    }
  }

  private scheduleSnapshot(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flushSnapshot(), 500)
  }

  private flushSnapshot(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    try {
      if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true })
      fs.writeFileSync(
        SNAPSHOT_PATH,
        JSON.stringify(
          { userQueues: Object.fromEntries(this.userQueues), userOrder: this.userOrder, state: this.state },
          null,
          2,
        ),
      )
    } catch (err) {
      this.logger.warn(`Could not save snapshot: ${err}`)
    }
  }

  private rebuildPublicState(): void {
    this.state.queue = this.userOrder.map(u => this.userQueues.get(u)![0])
    this.state.userQueues = Object.fromEntries(
      Array.from(this.userQueues.entries()).map(([u, items]) => [u, [...items]]),
    )
  }

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

    // One slot per user in the displayed queue + full per-user backlog
    this.rebuildPublicState()

    this.logger.log(`[enqueue] AFTER  — rotation: [${this.userOrder.join(', ')}] | queue: [${this.state.queue.map(q => q.addedBy).join(', ')}] | ${username} personal: ${this.userQueues.get(username)!.length} song(s)`)

    if (!this.state.currentSong) {
      this.advanceSong()
    } else {
      this.scheduleSnapshot()
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
      this.rebuildPublicState()
      this.logger.log('Queue empty — nothing to play')
      this.eventEmitter.emit('room.songAdvanced', { ...this.state })
      this.scheduleSnapshot()
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
    this.rebuildPublicState()

    this.logger.log(`[advance] AFTER  — now playing: "${next.title}" by ${username} | rotation: [${this.userOrder.join(', ')}] | queue: [${this.state.queue.map(q => q.addedBy).join(', ')}]`)

    this.eventEmitter.emit('room.songAdvanced', { ...this.state })
    this.scheduleSnapshot()

    const duration = next.duration > 0 ? next.duration : FALLBACK_DURATION_SECONDS
    this.advanceTimer = setTimeout(() => {
      this.advanceSong()
    }, duration * 1000)
  }

  removeFromQueue(username: string, songId: string): boolean {
    const userQueue = this.userQueues.get(username)
    if (!userQueue) return false
    const idx = userQueue.findIndex(s => s.id === songId)
    if (idx === -1) return false

    userQueue.splice(idx, 1)
    if (userQueue.length === 0) {
      this.userQueues.delete(username)
      this.userOrder = this.userOrder.filter(u => u !== username)
    }
    this.rebuildPublicState()
    this.logger.log(`[remove] ${username} removed song ${songId} — personal: ${userQueue.length} song(s)`)
    this.scheduleSnapshot()
    return true
  }

  moveToTop(username: string, songId: string): boolean {
    const userQueue = this.userQueues.get(username)
    if (!userQueue) return false
    const idx = userQueue.findIndex(s => s.id === songId)
    if (idx === -1) return false
    if (idx === 0) return true

    const [song] = userQueue.splice(idx, 1)
    userQueue.unshift(song)
    this.rebuildPublicState()
    this.logger.log(`[moveTop] ${username} moved song ${songId} to top`)
    this.scheduleSnapshot()
    return true
  }

  moveToBottom(username: string, songId: string): boolean {
    const userQueue = this.userQueues.get(username)
    if (!userQueue) return false
    const idx = userQueue.findIndex(s => s.id === songId)
    if (idx === -1) return false
    if (idx === userQueue.length - 1) return true

    const [song] = userQueue.splice(idx, 1)
    userQueue.push(song)
    this.rebuildPublicState()
    this.logger.log(`[moveBottom] ${username} moved song ${songId} to bottom`)
    this.scheduleSnapshot()
    return true
  }
}
