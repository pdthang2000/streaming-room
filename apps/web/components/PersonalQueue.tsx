'use client'

import type { QueueItem } from '@listenroom/shared'

interface Props {
  songs: QueueItem[]
  onRemove: (songId: string) => void
  onMoveTop: (songId: string) => void
  onMoveBottom: (songId: string) => void
}

export function PersonalQueue({ songs, onRemove, onMoveTop, onMoveBottom }: Props) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-6 h-full flex flex-col">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-4">My Queue</p>

      {songs.length === 0 ? (
        <p className="text-zinc-500 italic text-sm">Your queue is empty — add a song.</p>
      ) : (
        <ol className="space-y-3 overflow-y-auto flex-1">
          {songs.map((item, i) => {
            const isFirst = i === 0
            const isLast = i === songs.length - 1
            return (
              <li key={item.id} className="flex items-start gap-2">
                <span className="text-zinc-600 text-sm w-4 shrink-0 pt-1">{i + 1}</span>
                <div className="overflow-hidden flex-1 min-w-0">
                  <span
                    className="block text-zinc-300 text-sm whitespace-nowrap animate-[marquee_12s_linear_infinite]"
                    title={item.title}
                  >
                    {item.title}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onMoveTop(item.id)}
                    disabled={isFirst}
                    title="Move to top"
                    className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => onMoveBottom(item.id)}
                    disabled={isLast}
                    title="Move to bottom"
                    className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => onRemove(item.id)}
                    title="Remove"
                    className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
