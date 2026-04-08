import '../../test/setup'
import * as fs from 'fs'
import * as path from 'path'
import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { QueueService } from '../queue/queue.service'
import { RoomService } from './room.service'
import { makeSong } from '../../test/fixtures/songs'

const STATE_DIR = process.env.STATE_DIR!

// Use only the service layer (no gateway) to avoid null socket.server noise
async function buildApp(): Promise<TestingModule> {
  const module = await Test.createTestingModule({
    imports: [EventEmitterModule.forRoot()],
    providers: [RoomService, QueueService],
  }).compile()
  await module.init()
  return module
}

describe('Snapshot persistence — module restart scenarios', () => {
  it('queue survives a module restart', async () => {
    const mod1 = await buildApp()
    const svc1 = mod1.get(RoomService)

    svc1.enqueue(makeSong({ addedBy: 'alice', id: 'a1' }))
    svc1.enqueue(makeSong({ addedBy: 'bob', id: 'b1' }))

    await new Promise(r => setTimeout(r, 700)) // wait for debounce
    await mod1.close()

    const mod2 = await buildApp()
    const svc2 = mod2.get(RoomService)
    const state = svc2.getRoomState()

    expect(state.currentSong?.addedBy).toBe('alice')
    expect(state.queue[0].addedBy).toBe('bob')

    await mod2.close()
  })

  it('currentSong and startedAt survive restart', async () => {
    const mod1 = await buildApp()
    const svc1 = mod1.get(RoomService)

    svc1.enqueue(makeSong({ addedBy: 'alice', id: 'a1' }))

    await new Promise(r => setTimeout(r, 700))
    const startedAt = svc1.getRoomState().startedAt
    await mod1.close()

    const mod2 = await buildApp()
    const svc2 = mod2.get(RoomService)
    const state = svc2.getRoomState()

    expect(state.currentSong?.addedBy).toBe('alice')
    expect(state.startedAt).toBe(startedAt)
    expect(state.elapsed).toBeGreaterThanOrEqual(0)

    await mod2.close()
  })

  it('metaCache survives restart — no re-download needed', async () => {
    const mod1 = await buildApp()
    const qsvc1 = mod1.get(QueueService)

    // Seed metaCache manually (simulates a prior download)
    ;(qsvc1 as any).metaCache.set('cf7142b9a741', {
      title: 'Cached Song',
      duration: 15,
      originalUrl: 'https://example.com/cached',
    })
    ;(qsvc1 as any).saveMetaCache()

    await mod1.close()

    const mod2 = await buildApp()
    const qsvc2 = mod2.get(QueueService)
    const cached = (qsvc2 as any).metaCache.get('cf7142b9a741')

    expect(cached).toBeDefined()
    expect(cached.title).toBe('Cached Song')
    expect(cached.duration).toBe(15)

    await mod2.close()
  })

  it('stale song auto-advances on restart', async () => {
    const mod1 = await buildApp()
    const svc1 = mod1.get(RoomService)

    svc1.enqueue(makeSong({ addedBy: 'alice', id: 'a1', duration: 15 }))
    svc1.enqueue(makeSong({ addedBy: 'bob', id: 'b1', duration: 15 }))

    await new Promise(r => setTimeout(r, 700))
    await mod1.close()

    // Backdate startedAt AFTER close (close flushes the real snapshot, we overwrite it)
    const snapPath = path.join(STATE_DIR, 'room-state.json')
    const snap = JSON.parse(fs.readFileSync(snapPath, 'utf-8'))
    snap.state.startedAt = Date.now() - 30_000
    fs.writeFileSync(snapPath, JSON.stringify(snap))

    const mod2 = await buildApp()
    const svc2 = mod2.get(RoomService)

    await new Promise(r => setTimeout(r, 100)) // let setImmediate fire

    expect(svc2.getRoomState().currentSong?.addedBy).toBe('bob')

    await mod2.close()
  })

  it('fresh start with no snapshot → empty state', async () => {
    // STATE_DIR is wiped between tests by setup.ts afterEach
    const mod = await buildApp()
    const svc = mod.get(RoomService)
    const state = svc.getRoomState()

    expect(state.currentSong).toBeNull()
    expect(state.queue).toHaveLength(0)
    expect(state.elapsed).toBeNull()

    await mod.close()
  })

  it('multi-user rotation survives restart', async () => {
    const mod1 = await buildApp()
    const svc1 = mod1.get(RoomService)

    svc1.enqueue(makeSong({ addedBy: 'alice', id: 'a1' }))
    svc1.enqueue(makeSong({ addedBy: 'bob', id: 'b1' }))
    svc1.enqueue(makeSong({ addedBy: 'alice', id: 'a2' }))

    await new Promise(r => setTimeout(r, 700))
    await mod1.close()

    const mod2 = await buildApp()
    const svc2 = mod2.get(RoomService)

    // alice is playing, bob is next in queue
    expect(svc2.getRoomState().currentSong?.addedBy).toBe('alice')

    svc2.advanceSong()
    expect(svc2.getRoomState().currentSong?.addedBy).toBe('bob')

    svc2.advanceSong()
    expect(svc2.getRoomState().currentSong?.addedBy).toBe('alice')

    await mod2.close()
  })
})
