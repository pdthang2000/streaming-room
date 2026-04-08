'use client'

import { useState, FormEvent } from 'react'

interface Props {
  onConfirm: (username: string) => void
}

export function UsernameModal({ onConfirm }: Props) {
  const [input, setInput] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    <div className="fixed inset-0 bg-zinc-950/90 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-2xl p-8 w-full max-w-sm space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Welcome to ListenRoom</h2>
          <p className="text-sm text-zinc-400 mt-1">Enter a display name to join the room.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Your name"
            maxLength={32}
            autoFocus
            className="w-full bg-zinc-800 text-zinc-100 placeholder-zinc-600 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
          >
            Join
          </button>
        </form>
      </div>
    </div>
  )
}
