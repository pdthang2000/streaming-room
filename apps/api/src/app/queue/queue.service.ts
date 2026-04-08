import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { QueueItem } from '@listenroom/shared'

const CACHE_DIR = path.resolve(process.cwd(), 'apps/api/audio-cache')

function getFileId(sourceUrl: string): string {
  return createHash('md5').update(sourceUrl).digest('hex').slice(0, 12)
}

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name)
  private metaCache = new Map<string, { title: string; duration: number; originalUrl: string }>()

  onModuleInit() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true })
      this.logger.log(`Created audio cache dir: ${CACHE_DIR}`)
    }
  }

  async downloadAndEnqueue(
    sourceUrl: string,
    addedBy: string,
    onProgress?: (progress: number) => void,
  ): Promise<QueueItem> {
    const fileId = getFileId(sourceUrl)
    const mp3Path = path.join(CACHE_DIR, `${fileId}.mp3`)

    // Return cached item if file already exists
    if (fs.existsSync(mp3Path) && this.metaCache.has(fileId)) {
      const cached = this.metaCache.get(fileId)!
      return {
        id: crypto.randomUUID(),
        title: cached.title,
        duration: cached.duration,
        fileId,
        sourceUrl,
        addedBy,
      }
    }

    const { title, duration } = await this.download(sourceUrl, fileId, onProgress)
    this.metaCache.set(fileId, { title, duration, originalUrl: sourceUrl })

    return {
      id: crypto.randomUUID(),
      title,
      duration,
      fileId,
      sourceUrl,
      addedBy,
    }
  }

  private download(
    sourceUrl: string,
    fileId: string,
    onProgress?: (progress: number) => void,
  ): Promise<{ title: string; duration: number }> {
    // Use a temp filename during download; yt-dlp will rename after conversion
    const outputTemplate = path.join(CACHE_DIR, `${fileId}.%(ext)s`)
    const finalMp3 = path.join(CACHE_DIR, `${fileId}.mp3`)

    return new Promise((resolve, reject) => {
      const args = [
        sourceUrl,
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--output', outputTemplate,
        '--print', 'after_move:%(title)s|||%(duration)s',
        '--no-playlist',
      ]

      let proc: ReturnType<typeof spawn>
      try {
        proc = spawn('yt-dlp', args)
      } catch (err) {
        return reject(new Error('yt-dlp is not installed or not found in PATH'))
      }

      let meta = ''
      let stderrBuf = ''

      proc.stdout?.on('data', (data: Buffer) => {
        const line = data.toString()
        const match = line.match(/(\d+\.?\d*)%/)
        if (match && onProgress) onProgress(parseFloat(match[1]))
        if (line.includes('|||')) meta = line.trim()
      })

      proc.stderr?.on('data', (data: Buffer) => {
        const line = data.toString()
        stderrBuf += line
        const match = line.match(/(\d+\.?\d*)%/)
        if (match && onProgress) onProgress(parseFloat(match[1]))
      })

      proc.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          reject(new Error('yt-dlp is not installed or not found in PATH'))
        } else {
          reject(err)
        }
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          // Clean up any partial/unconverted file left behind
          for (const ext of ['webm', 'm4a', 'opus', 'ogg', 'part']) {
            const leftover = path.join(CACHE_DIR, `${fileId}.${ext}`)
            if (fs.existsSync(leftover)) fs.unlinkSync(leftover)
          }
          const reason = stderrBuf.trim().split('\n').pop() || `exit code ${code}`
          return reject(new Error(`yt-dlp failed: ${reason}`))
        }

        // Guard: if the mp3 wasn't produced, ffmpeg likely wasn't available
        if (!fs.existsSync(finalMp3)) {
          // Clean up whatever was left
          for (const ext of ['webm', 'm4a', 'opus', 'ogg']) {
            const leftover = path.join(CACHE_DIR, `${fileId}.${ext}`)
            if (fs.existsSync(leftover)) fs.unlinkSync(leftover)
          }
          return reject(new Error('yt-dlp finished but mp3 was not produced — is ffmpeg installed?'))
        }

        const [rawTitle, rawDuration] = meta.split('|||')
        const title = rawTitle?.trim() || 'Unknown'
        let duration = parseInt(rawDuration?.trim() || '0', 10)
        if (!duration || isNaN(duration)) {
          this.logger.warn(`Duration missing for ${sourceUrl}, defaulting to 180s`)
          duration = 180
        }
        resolve({ title, duration })
      })
    })
  }
}
