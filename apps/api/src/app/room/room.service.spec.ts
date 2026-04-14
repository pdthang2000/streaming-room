import '../../test/setup'
import * as fs from 'fs'
import * as path from 'path'
import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { RoomService } from './room.service'
import { QueueService } from '../queue/queue.service'
import { SONG_A, SONG_B, SONG_C, makeSong } from '../../test/fixtures/songs'

const STATE_DIR = process.env.STATE_DIR!

async function buildModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [EventEmitterModule.forRoot()],
    providers: [
      RoomService,
      { provide: QueueService, useValue: { scheduleCleanup: jest.fn() } },
    ],
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

describe('RoomService — per-user queue management', () => {
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

  it('getRoomState exposes userQueues keyed by username', () => {
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a1' }))
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a2' }))
    service.enqueue(makeSong({ addedBy: 'bob',   id: 'b1' }))
    // alice's a1 is now currentSong — only a2 remains in her personal queue
    const state = service.getRoomState()
    expect(state.userQueues.alice).toHaveLength(1)
    expect(state.userQueues.alice[0].id).toBe('a2')
    expect(state.userQueues.bob).toHaveLength(1)
    expect(state.userQueues.bob[0].id).toBe('b1')
  })

  it('removeFromQueue drops a mid-queue song', () => {
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a1' }))
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a2' }))
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a3' }))
    // a1 now playing; alice's personal queue: [a2, a3]
    expect(service.removeFromQueue('alice', 'a2')).toBe(true)
    const state = service.getRoomState()
    expect(state.userQueues.alice.map(s => s.id)).toEqual(['a3'])
    expect(state.queue.map(s => s.id)).toEqual(['a3'])
  })

  it('removeFromQueue on the last song drops the user from rotation', () => {
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a1' }))
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a2' }))
    service.enqueue(makeSong({ addedBy: 'bob',   id: 'b1' }))
    // a1 playing, alice has [a2], bob has [b1]
    expect(service.removeFromQueue('alice', 'a2')).toBe(true)
    const state = service.getRoomState()
    expect(state.userQueues.alice).toBeUndefined()
    expect(state.queue.map(s => s.addedBy)).toEqual(['bob'])
  })

  it('removeFromQueue rejects a wrong-owner request', () => {
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a1' }))
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a2' }))
    // a1 playing, alice has [a2]
    expect(service.removeFromQueue('bob', 'a2')).toBe(false)
    expect(service.getRoomState().userQueues.alice.map(s => s.id)).toEqual(['a2'])
  })

  it('removeFromQueue returns false on unknown song id', () => {
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a1' }))
    expect(service.removeFromQueue('alice', 'does-not-exist')).toBe(false)
  })

  it('moveToTop reorders a user personal queue and updates rotation slot', () => {
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a1' }))
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a2' }))
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a3' }))
    // a1 playing; alice has [a2, a3]
    expect(service.moveToTop('alice', 'a3')).toBe(true)
    const state = service.getRoomState()
    expect(state.userQueues.alice.map(s => s.id)).toEqual(['a3', 'a2'])
    expect(state.queue[0].id).toBe('a3')
  })

  it('moveToTop on already-first song is a no-op success', () => {
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a1' }))
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a2' }))
    // a1 playing; alice has [a2]
    expect(service.moveToTop('alice', 'a2')).toBe(true)
    expect(service.getRoomState().userQueues.alice.map(s => s.id)).toEqual(['a2'])
  })

  it('moveToBottom sends a song to the end of the personal queue', () => {
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a1' }))
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a2' }))
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a3' }))
    // a1 playing; alice has [a2, a3]
    expect(service.moveToBottom('alice', 'a2')).toBe(true)
    const state = service.getRoomState()
    expect(state.userQueues.alice.map(s => s.id)).toEqual(['a3', 'a2'])
    expect(state.queue[0].id).toBe('a3')
  })

  it('moveToTop rejects a wrong-owner request', () => {
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a1' }))
    service.enqueue(makeSong({ addedBy: 'alice', id: 'a2' }))
    expect(service.moveToTop('bob', 'a2')).toBe(false)
    expect(service.getRoomState().userQueues.alice.map(s => s.id)).toEqual(['a2'])
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
