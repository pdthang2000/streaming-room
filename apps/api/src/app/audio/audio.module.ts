import { Module } from '@nestjs/common'
import { ServeStaticModule } from '@nestjs/serve-static'
import * as path from 'path'

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: path.resolve(process.cwd(), 'apps/api/audio-cache'),
      serveRoot: '/audio',
    }),
  ],
})
export class AudioModule {}
