import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const TEST_CACHE_DIR = path.resolve(__dirname, '../../test-cache')
const TEST_STATE_DIR = path.join(os.tmpdir(), `listenroom-test-${process.pid}`)

// Set env vars before any module is loaded
process.env.AUDIO_CACHE_DIR = TEST_CACHE_DIR
process.env.STATE_DIR = TEST_STATE_DIR

beforeAll(() => {
  fs.mkdirSync(TEST_STATE_DIR, { recursive: true })
})

afterAll(() => {
  fs.rmSync(TEST_STATE_DIR, { recursive: true, force: true })
})

afterEach(() => {
  // Wipe state dir between tests so each starts clean
  for (const file of fs.readdirSync(TEST_STATE_DIR)) {
    fs.unlinkSync(path.join(TEST_STATE_DIR, file))
  }
})
