'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Cell } from '@/lib/types'
import ModerationRow from '@/components/admin/ModerationRow'

type QueuedCell = Cell & { reportReasons: string[] }

interface QueueResponse {
  items: QueuedCell[]
  nextCursor: number | null
}

export default function ModerationQueue() {
  const [items, setItems] = useState<QueuedCell[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPage = useCallback(async (cursor?: number) => {
    const url = cursor !== undefined ? `/admin/api/queue?cursor=${cursor}` : '/admin/api/queue'
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error('Failed to load moderation queue.')
    }

    return (await response.json()) as QueueResponse
  }, [])

  useEffect(() => {
    let cancelled = false

    setIsLoading(true)
    setError(null)

    loadPage()
      .then((data) => {
        if (cancelled) return
        setItems(data.items)
        setNextCursor(data.nextCursor)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the moderation queue.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [loadPage])

  async function handleLoadMore() {
    if (nextCursor === null) return

    setIsLoadingMore(true)
    setError(null)

    try {
      const data = await loadPage(nextCursor)
      setItems((prev) => [...prev, ...data.items])
      setNextCursor(data.nextCursor)
    } catch {
      setError('Could not load more items.')
    } finally {
      setIsLoadingMore(false)
    }
  }

  function handleResolved(cellId: number) {
    setItems((prev) => prev.filter((item) => item.id !== cellId))
  }

  return (
    <section aria-labelledby="moderation-queue-heading" className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 id="moderation-queue-heading" className="text-sm font-semibold text-gray-900">
          Moderation queue
        </h2>
        <p className="text-xs text-gray-500">Cells that are flagged or have open reports.</p>
      </div>

      {isLoading ? (
        <p className="px-4 py-6 text-sm text-gray-500">Loading…</p>
      ) : error ? (
        <p className="px-4 py-6 text-sm text-red-600">{error}</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">Nothing needs review right now.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Coordinates</th>
                <th className="px-3 py-2 text-center">Char</th>
                <th className="px-3 py-2">Flags / reports</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((cell) => (
                <ModerationRow key={cell.id} cell={cell} onResolved={handleResolved} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor !== null ? (
        <div className="border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            disabled={isLoadingMore}
            onClick={handleLoadMore}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </section>
  )
}
