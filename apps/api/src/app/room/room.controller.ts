import { Controller, Get } from '@nestjs/common'
import { RoomService } from './room.service'

@Controller('room')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Get()
  getRoom() {
    return this.roomService.getRoomState()
  }
}
