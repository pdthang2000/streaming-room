import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { QueueItem, RoomState } from '@listenroom/shared'

const FALLBACK_DURATION_SECONDS = 180

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name)

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
    this.state.queue.push(item)
    if (!this.state.currentSong) {
      this.advanceSong()
    }
  }

  advanceSong(): void {
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer)
      this.advanceTimer = null
    }

    if (this.state.queue.length === 0) {
      this.state.currentSong = null
      this.state.startedAt = null
      this.logger.log('Queue empty — nothing to play')
      return
    }

    const next = this.state.queue.shift()!
    this.state.currentSong = next
    this.state.startedAt = Date.now()

    this.logger.log(`Now playing: ${next.title} (${next.duration}s)`)

    this.eventEmitter.emit('room.songAdvanced', { ...this.state })

    const duration = next.duration > 0 ? next.duration : FALLBACK_DURATION_SECONDS
    this.advanceTimer = setTimeout(() => {
      this.advanceSong()
    }, duration * 1000)
  }
}
