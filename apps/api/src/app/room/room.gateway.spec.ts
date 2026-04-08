import '../../test/setup'
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { io, Socket } from 'socket.io-client'
import { RoomModule } from './room.module'
import { QueueModule } from '../queue/queue.module'
import { QueueService } from '../queue/queue.service'
import { EVENTS } from '@listenroom/shared'
import { SONG_A, SONG_B, makeSong } from '../../test/fixtures/songs'

function waitFor<T>(socket: Socket, event: string): Promise<T> {
  return new Promise(resolve => socket.once(event, resolve))
}

function connect(port: number, username: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(`http://localhost:${port}`, { forceNew: true })
    s.once('connect', () => resolve(s))
    s.once('connect_error', reject)
  })
}

describe('RoomGateway — socket integration', () => {
  let app: INestApplication
  let port: number
  let mockDownload: jest.SpyInstance
  const clients: Socket[] = []

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        RoomModule,
        QueueModule,
      ],
    }).compile()

    app = module.createNestApplication()
    await app.init()

    // Listen on a random port
    await app.listen(0)
    const server = app.getHttpServer()
    port = server.address().port

    // Mock downloadAndEnqueue so tests don't call yt-dlp
    const queueService = app.get(QueueService)
    mockDownload = jest.spyOn(queueService, 'downloadAndEnqueue')
  })

  afterEach(async () => {
    for (const c of clients) c.disconnect()
    clients.length = 0
    await app.close()
  })

  async function getClient(username: string): Promise<Socket> {
    const s = await connect(port, username)
    clients.push(s)
    return s
  }

  it('joinRoom → receives roomState with correct shape', async () => {
    const alice = await getClient('alice')
    const state = await new Promise<any>(resolve => {
      alice.emit(EVENTS.JOIN_ROOM, { username: 'alice' })
      alice.once(EVENTS.ROOM_STATE, resolve)
    })
    expect(state).toHaveProperty('currentSong')
    expect(state).toHaveProperty('queue')
    expect(state).toHaveProperty('startedAt')
    expect(state).toHaveProperty('elapsed')
  })

  it('addToQueue → receives downloadStatus done with item', async () => {
    mockDownload.mockResolvedValueOnce({ ...SONG_A, addedBy: 'alice' })
    const alice = await getClient('alice')
    alice.emit(EVENTS.JOIN_ROOM, { username: 'alice' })
    await waitFor(alice, EVENTS.ROOM_STATE)

    const status = await new Promise<any>(resolve => {
      alice.emit(EVENTS.ADD_TO_QUEUE, { url: SONG_A.sourceUrl, username: 'alice' })
      alice.on(EVENTS.DOWNLOAD_STATUS, (d: any) => {
        if (d.status === 'done') resolve(d)
      })
    })

    expect(status.item.title).toBe('Test Song A')
    expect(status.item.fileId).toBe(SONG_A.fileId)
  })

  it('addToQueue → all connected clients receive queueUpdated', async () => {
    mockDownload.mockResolvedValueOnce({ ...SONG_A, addedBy: 'alice' })
    const alice = await getClient('alice')
    const bob = await getClient('bob')

    alice.emit(EVENTS.JOIN_ROOM, { username: 'alice' })
    bob.emit(EVENTS.JOIN_ROOM, { username: 'bob' })
    await Promise.all([waitFor(alice, EVENTS.ROOM_STATE), waitFor(bob, EVENTS.ROOM_STATE)])

    const [aliceUpdate, bobUpdate] = await Promise.all([
      waitFor<any>(alice, EVENTS.QUEUE_UPDATED),
      waitFor<any>(bob, EVENTS.QUEUE_UPDATED),
      new Promise<void>(resolve => {
        alice.emit(EVENTS.ADD_TO_QUEUE, { url: SONG_A.sourceUrl, username: 'alice' })
        resolve()
      }),
    ])

    expect(aliceUpdate.currentSong?.title).toBe('Test Song A')
    expect(bobUpdate.currentSong?.title).toBe('Test Song A')
  })

  it('two users add songs → queueUpdated shows round-robin order', async () => {
    mockDownload
      .mockResolvedValueOnce({ ...SONG_A, addedBy: 'alice' })
      .mockResolvedValueOnce({ ...SONG_B, addedBy: 'bob' })

    const alice = await getClient('alice')
    const bob = await getClient('bob')
    alice.emit(EVENTS.JOIN_ROOM, { username: 'alice' })
    bob.emit(EVENTS.JOIN_ROOM, { username: 'bob' })
    await Promise.all([waitFor(alice, EVENTS.ROOM_STATE), waitFor(bob, EVENTS.ROOM_STATE)])

    // Alice adds first — drain queueUpdated on BOTH clients before bob adds
    alice.emit(EVENTS.ADD_TO_QUEUE, { url: SONG_A.sourceUrl, username: 'alice' })
    await Promise.all([waitFor(alice, EVENTS.QUEUE_UPDATED), waitFor(bob, EVENTS.QUEUE_UPDATED)])

    // Bob adds second
    const update = await new Promise<any>(resolve => {
      bob.emit(EVENTS.ADD_TO_QUEUE, { url: SONG_B.sourceUrl, username: 'bob' })
      bob.on(EVENTS.QUEUE_UPDATED, resolve)
    })

    // Alice is playing (currentSong), bob is in queue
    expect(update.currentSong?.addedBy).toBe('alice')
    expect(update.queue[0].addedBy).toBe('bob')
  })

  it('second client joins mid-song → elapsed > 0', async () => {
    mockDownload.mockResolvedValueOnce({ ...SONG_A, addedBy: 'alice' })
    const alice = await getClient('alice')
    alice.emit(EVENTS.JOIN_ROOM, { username: 'alice' })
    await waitFor(alice, EVENTS.ROOM_STATE)
    alice.emit(EVENTS.ADD_TO_QUEUE, { url: SONG_A.sourceUrl, username: 'alice' })
    await waitFor(alice, EVENTS.QUEUE_UPDATED)

    // Short delay so some time elapses
    await new Promise(r => setTimeout(r, 100))

    const bob = await getClient('bob')
    const state = await new Promise<any>(resolve => {
      bob.emit(EVENTS.JOIN_ROOM, { username: 'bob' })
      bob.once(EVENTS.ROOM_STATE, resolve)
    })

    expect(state.currentSong?.title).toBe('Test Song A')
    expect(state.elapsed).toBeGreaterThan(0)
  })

  it('skipSong → songStarted fires with next song', async () => {
    mockDownload
      .mockResolvedValueOnce({ ...SONG_A, addedBy: 'alice' })
      .mockResolvedValueOnce({ ...SONG_B, addedBy: 'bob' })

    const alice = await getClient('alice')
    alice.emit(EVENTS.JOIN_ROOM, { username: 'alice' })
    await waitFor(alice, EVENTS.ROOM_STATE)

    alice.emit(EVENTS.ADD_TO_QUEUE, { url: SONG_A.sourceUrl, username: 'alice' })
    await waitFor(alice, EVENTS.QUEUE_UPDATED)
    alice.emit(EVENTS.ADD_TO_QUEUE, { url: SONG_B.sourceUrl, username: 'bob' })
    await waitFor(alice, EVENTS.QUEUE_UPDATED)

    const next = await new Promise<any>(resolve => {
      alice.emit(EVENTS.SKIP_SONG, {})
      alice.once(EVENTS.SONG_STARTED, resolve)
    })

    expect(next.currentSong?.addedBy).toBe('bob')
  })

  it('download error → only the requesting client receives error status', async () => {
    mockDownload.mockRejectedValueOnce(new Error('yt-dlp failed: test error'))
    const alice = await getClient('alice')
    const bob = await getClient('bob')

    alice.emit(EVENTS.JOIN_ROOM, { username: 'alice' })
    bob.emit(EVENTS.JOIN_ROOM, { username: 'bob' })
    await Promise.all([waitFor(alice, EVENTS.ROOM_STATE), waitFor(bob, EVENTS.ROOM_STATE)])

    const bobErrors: any[] = []
    bob.on(EVENTS.DOWNLOAD_STATUS, (d: any) => { if (d.status === 'error') bobErrors.push(d) })

    const aliceError = await new Promise<any>(resolve => {
      alice.emit(EVENTS.ADD_TO_QUEUE, { url: 'bad-url', username: 'alice' })
      alice.on(EVENTS.DOWNLOAD_STATUS, (d: any) => { if (d.status === 'error') resolve(d) })
    })

    expect(aliceError.message).toContain('yt-dlp failed')
    expect(bobErrors).toHaveLength(0)
  })
})
