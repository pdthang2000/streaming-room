'use client'

import { useRoom } from '../hooks/useRoom'
import { NowPlaying } from '../components/NowPlaying'
import { Queue } from '../components/Queue'
import { SearchBox } from '../components/SearchBox'

export default function RoomPage() {
  const { currentSong, queue, downloadStatuses, audioRef, addToQueue, skipSong, connected } = useRoom()

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">ListenRoom</h1>
          <span className={`text-xs px-2 py-1 rounded-full ${connected ? 'bg-green-900 text-green-400' : 'bg-zinc-800 text-zinc-500'}`}>
            {connected ? 'connected' : 'connecting…'}
          </span>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">

          {/* Left — player + search */}
          <div className="space-y-4">
            <NowPlaying currentSong={currentSong} onSkip={skipSong} />
            <SearchBox downloadStatuses={downloadStatuses} onAdd={addToQueue} />
          </div>

          {/* Right — queue */}
          <Queue queue={queue} />
        </div>

        <audio ref={audioRef} style={{ display: 'none' }} />
      </div>
    </main>
  )
}
