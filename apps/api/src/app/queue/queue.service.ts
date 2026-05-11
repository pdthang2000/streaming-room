import { Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { QueueItem, SearchResult } from '@listenroom/shared'

const CACHE_DIR = process.env.AUDIO_CACHE_DIR ?? path.resolve(process.cwd(), 'apps/api/audio-cache')
const META_CACHE_PATH = process.env.STATE_DIR
  ? path.join(process.env.STATE_DIR, 'meta-cache.json')
  : path.resolve(process.cwd(), 'apps/api/.dev-state/meta-cache.json')

function getFileId(sourceUrl: string): string {
  return createHash('md5').update(sourceUrl).digest('hex').slice(0, 12)
}

@Injectable()
export class QueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(QueueService.name)
  private metaCache = new Map<string, { title: string; duration: number; originalUrl: string }>()
  private currentSearchProc: ReturnType<typeof spawn> | null = null

  onApplicationShutdown() {
    if (this.currentSearchProc) { this.currentSearchProc.kill(); this.currentSearchProc = null }
  }

  onModuleInit() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true })
      this.logger.log(`Created audio cache dir: ${CACHE_DIR}`)
    }
    this.loadMetaCache()
  }

  private loadMetaCache(): void {
    if (!fs.existsSync(META_CACHE_PATH)) return
    try {
      const data = JSON.parse(fs.readFileSync(META_CACHE_PATH, 'utf-8'))
      this.metaCache = new Map(Object.entries(data))
      this.logger.log(`Restored meta cache: ${this.metaCache.size} entries`)
    } catch (err) {
      this.logger.warn(`Could not load meta cache: ${err}`)
    }
  }

  private saveMetaCache(): void {
    try {
      const dir = path.dirname(META_CACHE_PATH)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(META_CACHE_PATH, JSON.stringify(Object.fromEntries(this.metaCache), null, 2))
    } catch (err) {
      this.logger.warn(`Could not save meta cache: ${err}`)
    }
  }

  scheduleCleanup(fileId: string, isStillNeeded: () => boolean): void {
    const timer = setTimeout(() => {
      if (isStillNeeded()) return
      const mp3Path = path.join(CACHE_DIR, `${fileId}.mp3`)
      if (fs.existsSync(mp3Path)) {
        try {
          fs.unlinkSync(mp3Path)
          this.logger.log(`Deleted cached MP3: ${fileId}.mp3`)
        } catch (err) {
          this.logger.warn(`Could not delete ${fileId}.mp3: ${err}`)
        }
      }
      this.metaCache.delete(fileId)
      this.saveMetaCache()
    }, 30_000)
    timer.unref()
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
    this.saveMetaCache()

    return {
      id: crypto.randomUUID(),
      title,
      duration,
      fileId,
      sourceUrl,
      addedBy,
    }
  }

  async searchTracks(query: string, limit: number): Promise<SearchResult[]> {
    // Kill any in-flight search process before starting a new one
    if (this.currentSearchProc) {
      this.currentSearchProc.kill()
      this.currentSearchProc = null
    }

    const args = [
      `ytsearch${limit}:${query}`,
      '--flat-playlist',
      '--no-warnings',
      '--print', '%(id)s|||%(title)s|||%(duration)s|||%(thumbnail)s|||%(uploader)s',
    ]

    const cookiesPath = '/app/cookies.txt'
    if (fs.existsSync(cookiesPath)) {
      args.push('--cookies', cookiesPath)
    }

    return new Promise((resolve, reject) => {
      let proc: ReturnType<typeof spawn>
      try {
        proc = spawn('yt-dlp', args)
      } catch (err) {
        return reject(new Error('yt-dlp is not installed or not found in PATH'))
      }

      this.currentSearchProc = proc

      let lineBuffer = ''
      let stderrBuf = ''

      proc.stdout?.on('data', (data: Buffer) => { lineBuffer += data.toString() })
      proc.stderr?.on('data', (data: Buffer) => { stderrBuf += data.toString() })

      proc.on('error', (err: NodeJS.ErrnoException) => {
        if (this.currentSearchProc === proc) this.currentSearchProc = null
        if (err.code === 'ENOENT') {
          reject(new Error('yt-dlp is not installed or not found in PATH'))
        } else {
          reject(err)
        }
      })

      proc.on('close', (code, signal) => {
        if (this.currentSearchProc === proc) this.currentSearchProc = null
        // Killed by a newer search — resolve silently with empty results
        if (signal === 'SIGTERM') return resolve([])
        if (code !== 0) {
          const reason = stderrBuf.trim().split('\n').pop() || `exit code ${code}`
          return reject(new Error(`yt-dlp search failed: ${reason}`))
        }

        const results: SearchResult[] = lineBuffer
          .split('\n')
          .filter(l => l.trim())
          .map(line => {
            const [id, title, durationStr, thumbnail, uploader] = line.trim().split('|||')
            if (!id || id === 'NA') return null
            return {
              videoId: id,
              title: title && title !== 'NA' ? title : 'Unknown',
              duration: parseInt(durationStr, 10) || 0,
              thumbnail: thumbnail && thumbnail !== 'NA'
                ? thumbnail
                : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
              uploader: uploader && uploader !== 'NA' ? uploader.trim() : 'Unknown',
              url: `https://www.youtube.com/watch?v=${id}`,
            } satisfies SearchResult
          })
          .filter((r): r is SearchResult => r !== null)

        resolve(results)
      })
    })
  }

  private download(
    sourceUrl: string,
    fileId: string,
    onProgress?: (progress: number) => void,
  ): Promise<{ title: string; duration: number }> {
    const outputTemplate = path.join(CACHE_DIR, `${fileId}.%(ext)s`)
    const finalMp3 = path.join(CACHE_DIR, `${fileId}.mp3`)

    return new Promise((resolve, reject) => {
      let settled = false
      const rejectOnce = (err: Error) => { if (!settled) { settled = true; reject(err) } }

      const args = [
        sourceUrl,
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--output', outputTemplate,
        '--print', 'before_dl:PRECHECK|||%(is_live)s|||%(filesize_approx)s',
        '--print', 'after_move:%(title)s|||%(duration)s',
        '--no-playlist',
      ]

      const cookiesPath = '/app/cookies.txt'
      if (require('fs').existsSync(cookiesPath)) {
        args.push('--cookies', cookiesPath)
      }

      let proc: ReturnType<typeof spawn>
      try {
        proc = spawn('yt-dlp', args)
      } catch (err) {
        return rejectOnce(new Error('yt-dlp is not installed or not found in PATH'))
      }

      let meta = ''
      let stderrBuf = ''

      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString()
        for (const line of chunk.split('\n')) {
          if (line.startsWith('PRECHECK|||')) {
            const [, isLive, fileSizeStr] = line.trim().split('|||')
            if (isLive === 'True') {
              proc.kill()
              rejectOnce(new Error('Livestreams are not supported'))
              return
            }
            const fileSize = parseInt(fileSizeStr, 10)
            if (!isNaN(fileSize) && fileSize > 20 * 1024 * 1024) {
              proc.kill()
              rejectOnce(new Error('Too heavy payload'))
              return
            }
          } else {
            const match = line.match(/(\d+\.?\d*)%/)
            if (match && onProgress) onProgress(parseFloat(match[1]))
            if (line.includes('|||')) meta = line.trim()
          }
        }
      })

      proc.stderr?.on('data', (data: Buffer) => {
        const line = data.toString()
        stderrBuf += line
        const match = line.match(/(\d+\.?\d*)%/)
        if (match && onProgress) onProgress(parseFloat(match[1]))
      })

      proc.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          rejectOnce(new Error('yt-dlp is not installed or not found in PATH'))
        } else {
          rejectOnce(err)
        }
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          for (const ext of ['webm', 'm4a', 'opus', 'ogg', 'part']) {
            const leftover = path.join(CACHE_DIR, `${fileId}.${ext}`)
            if (fs.existsSync(leftover)) fs.unlinkSync(leftover)
          }
          const reason = stderrBuf.trim().split('\n').pop() || `exit code ${code}`
          return rejectOnce(new Error(`yt-dlp failed: ${reason}`))
        }

        if (!fs.existsSync(finalMp3)) {
          for (const ext of ['webm', 'm4a', 'opus', 'ogg']) {
            const leftover = path.join(CACHE_DIR, `${fileId}.${ext}`)
            if (fs.existsSync(leftover)) fs.unlinkSync(leftover)
          }
          return rejectOnce(new Error('yt-dlp finished but mp3 was not produced — is ffmpeg installed?'))
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
