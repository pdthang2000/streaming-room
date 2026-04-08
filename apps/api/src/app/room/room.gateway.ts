import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { OnEvent } from '@nestjs/event-emitter'
import { Server, Socket } from 'socket.io'
import { RoomService } from './room.service'
import { QueueService } from '../queue/queue.service'
import {
  EVENTS,
  RoomState,
  AddToQueuePayload,
  JoinRoomPayload,
} from '@listenroom/shared'
import { Logger } from '@nestjs/common'

@WebSocketGateway({ cors: { origin: '*', methods: ['GET', 'POST'] } })
export class RoomGateway {
  @WebSocketServer()
  server!: Server

  private readonly logger = new Logger(RoomGateway.name)

  constructor(
    private readonly roomService: RoomService,
    private readonly queueService: QueueService,
  ) {}

  @SubscribeMessage(EVENTS.JOIN_ROOM)
  handleJoin(
    @MessageBody() data: JoinRoomPayload,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`${data?.username ?? 'unknown'} joined (${client.id})`)
    const state = this.roomService.getRoomState()
    client.emit(EVENTS.ROOM_STATE, state)
  }

  @SubscribeMessage(EVENTS.ADD_TO_QUEUE)
  async handleAddToQueue(
    @MessageBody() data: AddToQueuePayload,
    @ConnectedSocket() client: Socket,
  ) {
    this.server.emit(EVENTS.DOWNLOAD_STATUS, {
      url: data.url,
      status: 'downloading',
      progress: 0,
    })

    this.logger.log(`Downloading: ${data.url}`)

    try {
      const addedBy = data.username?.trim() || 'anonymous'
      const item = await this.queueService.downloadAndEnqueue(
        data.url,
        addedBy,
        (progress) => {
          this.server.emit(EVENTS.DOWNLOAD_STATUS, {
            url: data.url,
            status: 'downloading',
            progress,
          })
        },
      )

      this.logger.log(`Queued: "${item.title}" (${item.duration}s)`)

      this.server.emit(EVENTS.DOWNLOAD_STATUS, {
        url: data.url,
        status: 'done',
        item,
      })

      this.roomService.enqueue(item)
      this.server.emit(EVENTS.QUEUE_UPDATED, this.roomService.getRoomState())
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`Download failed for ${data.url}: ${message}`)
      client.emit(EVENTS.DOWNLOAD_STATUS, {
        url: data.url,
        status: 'error',
        message,
      })
    }
  }

  @SubscribeMessage(EVENTS.SKIP_SONG)
  handleSkip() {
    this.roomService.advanceSong()
  }

  @OnEvent('room.songAdvanced')
  handleSongAdvanced(state: RoomState) {
    this.server.emit(EVENTS.SONG_STARTED, state)
  }
}
