'use client'

import { useEffect, useState } from 'react'
import { formatCount } from '@/lib/format'

interface GridStats {
  available: number
  reserved: number
  sold: number
  flagged: number
  removed: number
}

const LABELS: Record<keyof GridStats, string> = {
  available: 'Available',
  reserved: 'Reserved',
  sold: 'Sold',
  flagged: 'Flagged',
  removed: 'Removed',
}

export default function StatsPanel() {
  const [stats, setStats] = useState<GridStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch('/admin/api/stats')
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load stats.')
        return response.json() as Promise<GridStats>
      })
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load grid stats.')
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section aria-labelledby="stats-heading" className="rounded-lg border border-gray-200 bg-white px-4 py-4">
      <h2 id="stats-heading" className="text-sm font-semibold text-gray-900">
        Grid status
      </h2>

      {error ? (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      ) : !stats ? (
        <p className="mt-2 text-sm text-gray-500">Loading…</p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {(Object.keys(LABELS) as Array<keyof GridStats>).map((key) => (
            <div key={key}>
              <dt className="text-xs text-gray-500">{LABELS[key]}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-gray-900">{formatCount(stats[key])}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
