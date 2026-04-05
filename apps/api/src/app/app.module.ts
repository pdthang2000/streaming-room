import { Module } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { RoomModule } from './room/room.module'
import { QueueModule } from './queue/queue.module'
import { AudioModule } from './audio/audio.module'

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    AudioModule,
    RoomModule,
    QueueModule,
  ],
})
export class AppModule {}
