# 03 — Backend (NestJS)

Build the NestJS backend in this order. Reference `02-architecture.md` for the full picture.

---

## 1. Shared Library First

Before writing any NestJS code, implement `libs/shared/src/index.ts`.
See `docs/05-contracts.md` for the exact content.
Both the frontend and backend import from `@listenroom/shared`.

---

## 2. QueueService — yt-dlp Integration

**File:** `apps/api/src/app/queue/queue.service.ts`

Responsibilities:
- Accept a URL or search query string
- Spawn `yt-dlp` as a child process to download the audio
- Emit download progress events via a callback/EventEmitter
- Return a completed `QueueItem` when done

### yt-dlp command to use:

```ts
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import * as path from 'path'

const CACHE_DIR = path.resolve(__dirname, '../../../../audio-cache')

function getFileId(sourceUrl: string): string {
  return createHash('md5').update(sourceUrl).digest('hex').slice(0, 12)
}

function downloadAudio(sourceUrl: string, onProgress?: (p: number) => void): Promise<{ title: string, duration: number, fileId: string }> {
  const fileId = getFileId(sourceUrl)
  const outputPath = path.join(CACHE_DIR, `${fileId}.%(ext)s`)

  return new Promise((resolve, reject) => {
    const args = [
      sourceUrl,
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--output', outputPath,
      '--print', 'after_move:%(title)s|||%(duration)s',  // print title and duration after download
      '--no-playlist',
    ]

    const proc = spawn('yt-dlp', args)
    let meta = ''

    proc.stdout.on('data', (data: Buffer) => {
      const line = data.toString()
      // parse progress percentage if present
      const match = line.match(/(\d+\.\d+)%/)
      if (match && onProgress) onProgress(parseFloat(match[1]))
      // capture metadata line
      if (line.includes('|||')) meta = line.trim()
    })

    proc.stderr.on('data', (data: Buffer) => {
      // yt-dlp writes progress to stderr — safe to ignore or log
    })

    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`yt-dlp exited with code ${code}`))
      const [title, durationStr] = meta.split('|||')
      resolve({
        title: title?.trim() || 'Unknown',
        duration: parseInt(durationStr?.trim() || '0', 10),
        fileId,
      })
    })
  })
}
```

### Cache check:

Before spawning yt-dlp, check if `audio-cache/{fileId}.mp3` already exists.
If it does, skip the download and return the cached metadata.

Store a simple in-memory map `Map<fileId, QueueItem>` as a cache index.

---

## 3. RoomService — Room State

**File:** `apps/api/src/app/room/room.service.ts`

```ts
@Injectable()
export class RoomService {
  private state: RoomState = {
    currentSong: null,
    startedAt: null,
    queue: [],
  }
  private advanceTimer: NodeJS.Timeout | null = null

  // Called by gateway when a client asks for current state
  getRoomState(): RoomState & { elapsed: number | null } {
    const elapsed = this.state.startedAt
      ? (Date.now() - this.state.startedAt) / 1000
      : null
    return { ...this.state, elapsed }
  }

  enqueue(item: QueueItem): void {
    this.state.queue.push(item)
    // if nothing is playing, start immediately
    if (!this.state.currentSong) {
      this.advanceSong()
    }
  }

  // Returns the new state after advancing
  advanceSong(): RoomState | null {
    if (this.advanceTimer) clearTimeout(this.advanceTimer)
    if (this.state.queue.length === 0) {
      this.state.currentSong = null
      this.state.startedAt = null
      return null
    }
    const next = this.state.queue.shift()!
    this.state.currentSong = next
    this.state.startedAt = Date.now()

    // schedule next advance
    this.advanceTimer = setTimeout(() => {
      this.advanceSong()
      // gateway must broadcast — inject gateway or use EventEmitter2
    }, next.duration * 1000)

    return this.state
  }
}
```

**Note on auto-advance broadcasting:**
The `RoomService` needs to tell the `RoomGateway` when a song ends so it can broadcast.
Use NestJS `EventEmitter2` for this:
- `RoomService` emits `room.songAdvanced` event
- `RoomGateway` listens with `@OnEvent('room.songAdvanced')` and broadcasts to all clients

Install: `pnpm add @nestjs/event-emitter`

---

## 4. RoomGateway — Socket.io

**File:** `apps/api/src/app/room/room.gateway.ts`

```ts
@WebSocketGateway({ cors: { origin: 'http://localhost:3000' } })
export class RoomGateway {
  @WebSocketServer()
  server: Server

  // Client joins the room — send them current state
  @SubscribeMessage('joinRoom')
  handleJoin(@ConnectedSocket() client: Socket) {
    const state = this.roomService.getRoomState()
    client.emit('roomState', state)
  }

  // Client submits a song to add
  @SubscribeMessage('addToQueue')
  async handleAddToQueue(
    @MessageBody() data: { url: string },
    @ConnectedSocket() client: Socket,
  ) {
    // 1. emit downloadStatus: 'pending' back to all clients
    this.server.emit('downloadStatus', { url: data.url, status: 'downloading' })

    try {
      const item = await this.queueService.downloadAndEnqueue(
        data.url,
        (progress) => {
          this.server.emit('downloadStatus', { url: data.url, status: 'downloading', progress })
        }
      )
      this.roomService.enqueue(item)
      this.server.emit('queueUpdated', this.roomService.getRoomState())
    } catch (err) {
      client.emit('downloadStatus', { url: data.url, status: 'error', message: err.message })
    }
  }

  // Triggered by EventEmitter when song auto-advances
  @OnEvent('room.songAdvanced')
  handleSongAdvanced(state: RoomState) {
    this.server.emit('songStarted', state)
  }
}
```

---

## 5. Audio Module — Static File Serving

**File:** `apps/api/src/app/audio/audio.module.ts`

```ts
import { ServeStaticModule } from '@nestjs/serve-static'
import * as path from 'path'

ServeStaticModule.forRoot({
  rootPath: path.resolve(__dirname, '../../../../audio-cache'),
  serveRoot: '/audio',
})
```

This serves `audio-cache/*.mp3` at `http://localhost:4000/audio/*.mp3`.
`@nestjs/serve-static` handles HTTP range requests automatically — no extra code needed.

Create the cache directory:
```bash
mkdir -p apps/api/audio-cache
echo "*.mp3" >> apps/api/audio-cache/.gitignore
```

---

## 6. AppModule Wiring

```ts
@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ServeStaticModule.forRoot({ ... }),
    RoomModule,
    QueueModule,
  ],
})
export class AppModule {}
```

---

## Error Handling Checklist

- [ ] yt-dlp not installed → catch spawn ENOENT, return clear error message
- [ ] yt-dlp download fails (private video, geo-block) → emit downloadStatus error
- [ ] Song duration is 0 or NaN → default to 180 seconds, log warning
- [ ] audio-cache directory doesn't exist → create it on startup in QueueService constructor
- [ ] Server restart → state resets cleanly, no stale file references