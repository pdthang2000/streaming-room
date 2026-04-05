import { Module } from '@nestjs/common'
import { RoomService } from './room.service'
import { RoomGateway } from './room.gateway'
import { RoomController } from './room.controller'
import { QueueModule } from '../queue/queue.module'

@Module({
  imports: [QueueModule],
  controllers: [RoomController],
  providers: [RoomService, RoomGateway],
  exports: [RoomService],
})
export class RoomModule {}
