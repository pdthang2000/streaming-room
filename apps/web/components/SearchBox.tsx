'use client'

import { useState, FormEvent } from 'react'
import type { DownloadStatus } from '@listenroom/shared'

interface Props {
  downloadStatuses: DownloadStatus[]
  onAdd: (url: string) => void
}

export function SearchBox({ downloadStatuses, onAdd }: Props) {
  const [input, setInput] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    const query = trimmed.startsWith('http') ? trimmed : `ytsearch1:${trimmed}`
    onAdd(query)
    setInput('')
  }

  const adding = downloadStatuses.some(
    (s) => s.status === 'downloading' || s.status === 'pending'
  )
  const errors = downloadStatuses.filter((s) => s.status === 'error')

  return (
    <div className="bg-zinc-900 rounded-2xl p-6 space-y-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500">Add a Song</p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste a URL or search YouTube..."
          className="flex-1 bg-zinc-800 text-zinc-100 placeholder-zinc-600 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
        >
          Add
        </button>
      </form>

      {adding && (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
          Adding song to queue…
        </div>
      )}

      {errors.map((s) => (
        <div key={s.url} className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
          <span className="text-red-400 truncate">{s.message ?? 'Failed to add song'}</span>
        </div>
      ))}
    </div>
  )
}
