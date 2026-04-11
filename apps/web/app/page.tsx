'use client'

import { useState, useEffect } from 'react'
import { useRoom } from '../hooks/useRoom'
import { NowPlaying } from '../components/NowPlaying'
import { Queue } from '../components/Queue'
import { PersonalQueue } from '../components/PersonalQueue'
import { SearchBox } from '../components/SearchBox'
import { UsernameModal } from '../components/UsernameModal'

const USERNAME_KEY = 'listenroom_username'

export default function RoomPage() {
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(USERNAME_KEY)
    if (stored) setUsername(stored)
  }, [])

  const handleUsernameConfirm = (name: string) => {
    localStorage.setItem(USERNAME_KEY, name)
    setUsername(name)
  }

  const handleEditUsername = () => {
    localStorage.removeItem(USERNAME_KEY)
    setUsername(null)
  }

  const {
    currentSong,
    queue,
    userQueues,
    downloadStatuses,
    audioRef,
    addToQueue,
    skipSong,
    removeFromQueue,
    moveToTop,
    moveToBottom,
    connected,
    currentTime,
  } = useRoom(username)

  const mySongs = username ? userQueues[username] ?? [] : []

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {username === null && <UsernameModal onConfirm={handleUsernameConfirm} />}

      <div className="max-w-7xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">ListenRoom</h1>
          <div className="flex items-center gap-3">
            {username && (
              <button
                onClick={handleEditUsername}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Change username"
              >
                {username} ✎
              </button>
            )}
            <span className={`text-xs px-2 py-1 rounded-full ${connected ? 'bg-green-900 text-green-400' : 'bg-zinc-800 text-zinc-500'}`}>
              {connected ? 'connected' : 'connecting…'}
            </span>
          </div>
        </div>

        {/* Three-column layout: my queue | player + search | room queue */}
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr_320px] gap-4">

          {/* Left — personal queue */}
          <PersonalQueue
            songs={mySongs}
            onRemove={removeFromQueue}
            onMoveTop={moveToTop}
            onMoveBottom={moveToBottom}
          />

          {/* Center — player + search */}
          <div className="space-y-4">
            <NowPlaying currentSong={currentSong} onSkip={skipSong} currentTime={currentTime} />
            <SearchBox downloadStatuses={downloadStatuses} onAdd={addToQueue} />
          </div>

          {/* Right — rotation queue */}
          <Queue queue={queue} />
        </div>

        <audio ref={audioRef} style={{ display: 'none' }} />
      </div>
    </main>
  )
}
