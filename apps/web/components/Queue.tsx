'use client'

import type { QueueItem } from '@listenroom/shared'

interface Props {
  queue: QueueItem[]
}

export function Queue({ queue }: Props) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-6 h-full flex flex-col">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-4">Up Next</p>

      {queue.length === 0 ? (
        <p className="text-zinc-500 italic text-sm">Queue is empty — add a song.</p>
      ) : (
        <ol className="space-y-3 overflow-y-auto flex-1">
          {queue.map((item, i) => (
            <li key={item.id} className="flex items-start gap-3">
              <span className="text-zinc-600 text-sm w-4 shrink-0 pt-0.5">{i + 1}</span>
              <div className="overflow-hidden flex-1">
                <span
                  key={item.id}
                  className="block text-zinc-300 text-sm whitespace-nowrap animate-[marquee_12s_linear_infinite]"
                >
                  {item.title}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
