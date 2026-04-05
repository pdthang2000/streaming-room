'use client'

import type { QueueItem } from '@listenroom/shared'

interface Props {
  currentSong: QueueItem | null
  onSkip: () => void
}

export function NowPlaying({ currentSong, onSkip }: Props) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-zinc-500">Now Playing</p>
        <button
          onClick={onSkip}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded-lg hover:bg-zinc-800"
        >
          Skip →
        </button>
      </div>

      {currentSong ? (
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
          </div>
        </div>
      ) : (
        <p className="text-zinc-500 italic">Nothing playing yet</p>
      )}
    </div>
  )
}
