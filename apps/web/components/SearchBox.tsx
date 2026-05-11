'use client'

import { useState, useEffect, FormEvent } from 'react'
import type { DownloadStatus, SearchResult } from '@listenroom/shared'

type Platform = 'youtube'

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'youtube', label: 'YouTube' },
]

function formatDuration(s: number): string {
  if (s === 0) return 'Live'
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface Props {
  downloadStatuses: DownloadStatus[]
  onAdd: (url: string) => void
  searchResults: SearchResult[]
  searchLoading: boolean
  onSearch: (query: string, platform: Platform) => void
  onClearSearch: () => void
}

export function SearchBox({
  downloadStatuses,
  onAdd,
  searchResults,
  searchLoading,
  onSearch,
  onClearSearch,
}: Props) {
  const [activeTab, setActiveTab] = useState<'link' | 'search'>('search')
  const [linkInput, setLinkInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [platform, setPlatform] = useState<Platform>('youtube')
  const [hasSearched, setHasSearched] = useState(false)

  // Clear results when switching tabs
  useEffect(() => {
    onClearSearch()
    setHasSearched(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // 1-second debounced auto-search
  useEffect(() => {
    if (!searchQuery.trim()) {
      onClearSearch()
      setHasSearched(false)
      return
    }
    const timer = setTimeout(() => {
      onSearch(searchQuery.trim(), platform)
      setHasSearched(true)
    }, 1000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, platform])

  const handleLinkSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = linkInput.trim()
    if (!trimmed) return
    const query = trimmed.startsWith('http') ? trimmed : `ytsearch1:${trimmed}`
    onAdd(query)
    setLinkInput('')
  }

  const successes = downloadStatuses.filter(s => s.status === 'done')
  const errors = downloadStatuses.filter(s => s.status === 'error')

  return (
    <div className="bg-zinc-900 rounded-2xl p-6">
      {/* Tab strip */}
      <div className="flex border-b border-zinc-800 mb-5">
        {(['search', 'link'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 mr-5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-violet-500 text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab === 'search' ? 'Search' : 'Add by Link'}
          </button>
        ))}
      </div>

      {/* Add by Link tab */}
      {activeTab === 'link' && (
        <div className="space-y-3">
          <form onSubmit={handleLinkSubmit} className="flex gap-2">
            <input
              type="text"
              value={linkInput}
              onChange={e => setLinkInput(e.target.value)}
              placeholder="Paste a URL…"
              className="flex-1 bg-zinc-800 text-zinc-100 placeholder-zinc-600 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button
              type="submit"
              disabled={!linkInput.trim()}
              className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Add
            </button>
          </form>

          {successes.map(s => (
            <div key={s.url} className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
              <span className="text-green-400 truncate">Added!</span>
            </div>
          ))}

          {errors.map(s => (
            <div key={s.url} className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              <span className="text-red-400 truncate">{s.message ?? 'Failed to add song'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search tab */}
      {activeTab === 'search' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value as Platform)}
              className="bg-zinc-800 text-zinc-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500 shrink-0"
            >
              {PLATFORMS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search for a song…"
              className="flex-1 bg-zinc-800 text-zinc-100 placeholder-zinc-600 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Loading */}
          {searchLoading && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
              Searching…
            </div>
          )}

          {/* No results */}
          {!searchLoading && hasSearched && searchResults.length === 0 && (
            <p className="text-sm text-zinc-500">No results found</p>
          )}

          {/* Results */}
          {!searchLoading && searchResults.length > 0 && (
            <ul className="space-y-2">
              {searchResults.map(result => (
                <li
                  key={result.videoId}
                  className="flex items-center gap-3 bg-zinc-800 rounded-xl p-3"
                >
                  {result.thumbnail ? (
                    <img
                      src={result.thumbnail}
                      alt=""
                      width={64}
                      height={48}
                      loading="lazy"
                      className="rounded-lg object-cover shrink-0"
                      style={{ width: 64, height: 48 }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className="w-16 h-12 bg-zinc-700 rounded-lg shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-100 truncate">{result.title}</p>
                    <p className="text-xs text-zinc-500 truncate">{result.uploader}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-zinc-500">{formatDuration(result.duration)}</span>
                    <button
                      onClick={() => { onAdd(result.url); onClearSearch() }}
                      className="bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                    >
                      + Add
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
