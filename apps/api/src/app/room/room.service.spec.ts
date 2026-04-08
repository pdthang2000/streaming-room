import '../../test/setup'
import * as fs from 'fs'
import * as path from 'path'
import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { RoomService } from './room.service'
import { SONG_A, SONG_B, SONG_C, makeSong } from '../../test/fixtures/songs'

const STATE_DIR = process.env.STATE_DIR!

async function buildModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [EventEmitterModule.forRoot()],
    providers: [RoomService],
  }).compile()
}

describe('RoomService — queue logic', () => {
  let module: TestingModule
  let service: RoomService

  beforeEach(async () => {
    module = await buildModule()
    service = module.get(RoomService)
    await module.init()
  })

  afterEach(async () => {
    await module.close()
  })

  it('single user adds one song → starts playing immediately', () => {
    service.enqueue({ ...SONG_A })
    const state = service.getRoomState()
    expect(state.currentSong?.title).toBe('Test Song A')
    expect(state.startedAt).not.toBeNull()
    expect(state.elapsed).toBeGreaterThanOrEqual(0)
  })

  it('single user adds two songs → second is in queue, not playing', () => {
    service.enqueue({ ...SONG_A, id: 'a1' })
    service.enqueue({ ...SONG_A, id: 'a2', title: 'Test Song A2' })
    const state = service.getRoomState()
    expect(state.currentSong?.id).toBe('a1')
    expect(state.queue).toHaveLength(1)
    expect(state.queue[0].id).toBe('a2')
  })

  it('two users each add one song → round-robin: alice plays first, bob is queued', () => {
    service.enqueue({ ...SONG_A, addedBy: 'alice' })
    service.enqueue({ ...SONG_B, addedBy: 'bob' })
    const state = service.getRoomState()
    expect(state.currentSong?.addedBy).toBe('alice')
    expect(state.queue[0].addedBy).toBe('bob')
  })

  it('two users add songs → after first song advances, second user plays', () => {
    service.enqueue({ ...SONG_A, addedBy: 'alice' })
    service.enqueue({ ...SONG_B, addedBy: 'bob' })
    service.advanceSong()
    const state = service.getRoomState()
    expect(state.currentSong?.addedBy).toBe('bob')
  })

  it('alice adds 2 songs, bob and charlie add 1 each → rotation is alice, bob, charlie, alice', () => {
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a1', title: 'Alice 1' }))
    service.enqueue(makeSong({ addedBy: 'bob',   id: 'b1', title: 'Bob 1' }))
    service.enqueue(makeSong({ addedBy: 'charlie', id: 'c1', title: 'Charlie 1' }))
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a2', title: 'Alice 2' }))

    // alice plays first (she was first in)
    expect(service.getRoomState().currentSong?.addedBy).toBe('alice')
    service.advanceSong()
    expect(service.getRoomState().currentSong?.addedBy).toBe('bob')
    service.advanceSong()
    expect(service.getRoomState().currentSong?.addedBy).toBe('charlie')
    service.advanceSong()
    expect(service.getRoomState().currentSong?.addedBy).toBe('alice')
  })

  it('advanceSong on empty queue → state is cleared', () => {
    service.advanceSong()
    const state = service.getRoomState()
    expect(state.currentSong).toBeNull()
    expect(state.startedAt).toBeNull()
    expect(state.queue).toHaveLength(0)
  })

  it('queue clears user from rotation once their songs are exhausted', () => {
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a1' }))
    service.enqueue(makeSong({ addedBy: 'bob',   id: 'b1' }))
    // alice has 1 song, bob has 1 song
    service.advanceSong() // plays bob
    service.advanceSong() // queue empty
    expect(service.getRoomState().currentSong).toBeNull()
  })
})

describe('RoomService — snapshot persistence', () => {
  it('snapshot file is written after enqueue', async () => {
    const module = await buildModule()
    const service = module.get(RoomService)
    await module.init()

    service.enqueue({ ...SONG_A })

    // Wait for debounce (500ms)
    await new Promise(r => setTimeout(r, 700))

    expect(fs.existsSync(path.join(STATE_DIR, 'room-state.json'))).toBe(true)
    await module.close()
  })

  it('snapshot file reflects current song after advance', async () => {
    const module = await buildModule()
    const service = module.get(RoomService)
    await module.init()

    service.enqueue({ ...SONG_A, addedBy: 'alice' })
    service.enqueue({ ...SONG_B, addedBy: 'bob' })
    service.advanceSong()

    await new Promise(r => setTimeout(r, 700))

    const snap = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'room-state.json'), 'utf-8'))
    expect(snap.state.currentSong.addedBy).toBe('bob')
    await module.close()
  })

  it('state is fully restored after module restart', async () => {
    // First module: add songs, let it flush
    const mod1 = await buildModule()
    const svc1 = mod1.get(RoomService)
    await mod1.init()

    svc1.enqueue({ ...SONG_A, addedBy: 'alice' })
    svc1.enqueue({ ...SONG_B, addedBy: 'bob' })

    await new Promise(r => setTimeout(r, 700))
    await mod1.close()

    // Second module: should restore from snapshot
    const mod2 = await buildModule()
    const svc2 = mod2.get(RoomService)
    await mod2.init()

    const state = svc2.getRoomState()
    expect(state.currentSong?.addedBy).toBe('alice')
    expect(state.queue[0].addedBy).toBe('bob')
    expect(state.elapsed).toBeGreaterThanOrEqual(0)

    await mod2.close()
  })

  it('stale song (elapsed > duration) auto-advances on restart', async () => {
    // First module: set a song that "started" 30s ago (longer than 15s duration)
    const mod1 = await buildModule()
    const svc1 = mod1.get(RoomService)
    await mod1.init()

    svc1.enqueue(makeSong({ addedBy: 'alice', id: 'a1', duration: 15 }))
    svc1.enqueue(makeSong({ addedBy: 'bob', id: 'b1' }))

    await new Promise(r => setTimeout(r, 700))
    await mod1.close()

    // Backdate startedAt AFTER close (close flushes the real snapshot, we overwrite it)
    const snapPath = path.join(STATE_DIR, 'room-state.json')
    const snap = JSON.parse(fs.readFileSync(snapPath, 'utf-8'))
    snap.state.startedAt = Date.now() - 30_000
    fs.writeFileSync(snapPath, JSON.stringify(snap))

    // Second module: stale song should be skipped, bob should play
    const mod2 = await buildModule()
    const svc2 = mod2.get(RoomService)
    await mod2.init()

    // Give setImmediate a tick to fire
    await new Promise(r => setTimeout(r, 50))

    expect(svc2.getRoomState().currentSong?.addedBy).toBe('bob')

    await mod2.close()
  })

  it('fresh start (no snapshot) → clean initial state', async () => {
    const module = await buildModule()
    const service = module.get(RoomService)
    await module.init()

    const state = service.getRoomState()
    expect(state.currentSong).toBeNull()
    expect(state.queue).toHaveLength(0)
    await module.close()
  })
})
