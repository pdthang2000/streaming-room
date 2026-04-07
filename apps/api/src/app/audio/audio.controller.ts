import { Controller, Get, Param, Req, Res, NotFoundException } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'

const CACHE_DIR = path.resolve(process.cwd(), 'apps/api/audio-cache')

@Controller('audio')
export class AudioController {
  @Get(':fileId.mp3')
  stream(
    @Param('fileId') fileId: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const filePath = path.join(CACHE_DIR, `${fileId}.mp3`)

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Audio file not found')
    }

    const stat = fs.statSync(filePath)
    const fileSize = stat.size
    const range = req.headers['range']

    // Tell reverse proxies (Nginx, Caddy, etc.) not to buffer this response.
    // Without this, a proxy holds the entire file before forwarding, and its
    // read/send timeout kills the connection mid-stream for long audio files.
    res.setHeader('X-Accel-Buffering', 'no')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'no-cache')

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
      const start = parseInt(startStr, 10)
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1
      const chunkSize = end - start + 1

      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
      res.setHeader('Content-Length', chunkSize)

      fs.createReadStream(filePath, { start, end }).pipe(res)
    } else {
      res.setHeader('Content-Length', fileSize)
      res.status(200)

      fs.createReadStream(filePath).pipe(res)
    }
  }
}
