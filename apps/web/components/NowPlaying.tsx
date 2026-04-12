'use client'

import type { QueueItem } from '@listenroom/shared'

function formatTime(seconds: number): string {
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

interface Props {
  currentSong: QueueItem | null
  onSkip: () => void
  currentTime: number
  username: string | null
}

export function NowPlaying({ currentSong, onSkip, currentTime, username }: Props) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-zinc-500">Now Playing</p>
        {currentSong && username === currentSong.addedBy && (
          <button
            onClick={onSkip}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded-lg hover:bg-zinc-800"
          >
            Skip →
          </button>
        )}
      </div>

      {currentSong ? (
        <>
          <div className="flex items-center gap-4">
            <div className="flex items-end gap-[3px] h-6 shrink-0">
              <span className="w-1 bg-violet-500 rounded-full animate-[wave_0.8s_ease-in-out_infinite] [animation-delay:0ms]" style={{ height: '40%' }} />
              <span className="w-1 bg-violet-500 rounded-full animate-[wave_0.8s_ease-in-out_infinite] [animation-delay:160ms]" style={{ height: '100%' }} />
              <span className="w-1 bg-violet-500 rounded-full animate-[wave_0.8s_ease-in-out_infinite] [animation-delay:320ms]" style={{ height: '60%' }} />
              <span className="w-1 bg-violet-500 rounded-full animate-[wave_0.8s_ease-in-out_infinite] [animation-delay:480ms]" style={{ height: '80%' }} />
            </div>
            <div className="overflow-hidden flex-1">
              <p
                key={currentSong.id}
                className="text-zinc-100 font-medium whitespace-nowrap animate-[marquee_12s_linear_infinite]"
              >
                {currentSong.title}
              </p>
              <p className="text-xs text-zinc-500 mt-1">added by {currentSong.addedBy}</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="w-full h-0.5 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-zinc-400 rounded-full transition-[width] duration-200 ease-linear"
                style={{ width: `${Math.min((currentTime / (currentSong.duration || 1)) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-zinc-500 tabular-nums">{formatTime(currentTime)}</span>
              <span className="text-[10px] text-zinc-500 tabular-nums">{formatTime(currentSong.duration)}</span>
            </div>
          </div>
        </>
      ) : (
        <p className="text-zinc-500 italic">Nothing playing yet</p>
      )}
    </div>
  )
}
