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

      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col h-screen">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 shrink-0">
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

        {/* Main layout: left content + right chat */}
        <div className="flex gap-4 flex-1 min-h-0">

          {/* Left column */}
          <div className="flex flex-col gap-4 flex-[3] min-w-0">

            {/* Now Playing */}
            <NowPlaying currentSong={currentSong} onSkip={skipSong} currentTime={currentTime} username={username} />

            {/* Add / Search */}
            <SearchBox downloadStatuses={downloadStatuses} onAdd={addToQueue} />

            {/* Bottom row: My queue + People's queue */}
            <div className="flex gap-4 flex-1 min-h-0">
              <div className="flex-1 min-w-0 overflow-hidden">
                <PersonalQueue
                  songs={mySongs}
                  onRemove={removeFromQueue}
                  onMoveTop={moveToTop}
                  onMoveBottom={moveToBottom}
                />
              </div>
              <div className="flex-[1.4] min-w-0 overflow-hidden">
                <Queue queue={queue} />
              </div>
            </div>
          </div>

          {/* Right column — chat placeholder */}
          <div className="flex-[1.4] bg-zinc-900 rounded-2xl p-6 flex flex-col min-w-0">
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-4">Chat</p>
            <div className="flex-1 flex items-center justify-center">
              <p className="text-zinc-600 italic text-sm text-center">Chat coming soon</p>
            </div>
          </div>

        </div>

        <audio ref={audioRef} style={{ display: 'none' }} />
      </div>
    </main>
  )
}
