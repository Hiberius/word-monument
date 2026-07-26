'use client'

import { useState } from 'react'
import type { Cell } from '@/lib/types'

type QueuedCell = Cell & { reportReasons: string[] }

interface ModerationRowProps {
  cell: QueuedCell
  onResolved: (cellId: number) => void
}

type ActionMode = 'remove' | 'clear' | null

// Remove un-publishes paid content, so it gets an explicit confirm step
// (reason required) rather than firing on a single click. Clear Flag is
// non-destructive - the cell stays published - so it only asks for a note.
export default function ModerationRow({ cell, onResolved }: ModerationRowProps) {
  const [mode, setMode] = useState<ActionMode>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setMode(null)
    setReason('')
    setNote('')
    setError(null)
  }

  async function handleRemove() {
    if (reason.trim().length === 0) {
      setError('A reason is required to remove this cell.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/admin/api/cells/${cell.id}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? 'Failed to remove cell.')
        return
      }

      onResolved(cell.id)
    } catch {
      setError('Network error. Try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleClearFlag() {
    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/admin/api/cells/${cell.id}/clear-flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? 'Failed to clear flag.')
        return
      }

      onResolved(cell.id)
    } catch {
      setError('Network error. Try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <tr className="border-b border-gray-200 align-top">
      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-700">
        ({cell.x}, {cell.y})
      </td>
      <td className="px-3 py-3 text-center font-mono text-sm text-gray-900">{cell.character ?? '-'}</td>
      <td className="px-3 py-3 text-sm text-gray-700">
        <span
          className={
            cell.moderationStatus === 'flagged'
              ? 'inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800'
              : 'inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700'
          }
        >
          {cell.moderationStatus}
        </span>
        {cell.reportReasons.length > 0 ? (
          <ul className="mt-1.5 list-inside list-disc text-xs text-gray-500">
            {cell.reportReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        ) : null}
      </td>
      <td className="px-3 py-3 text-sm">
        {mode === null ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('clear')}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Clear flag
            </button>
            <button
              type="button"
              onClick={() => setMode('remove')}
              className="rounded border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        ) : null}

        {mode === 'clear' ? (
          <div className="flex max-w-xs flex-col gap-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (why this was cleared)"
              rows={2}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 outline-none focus:border-gray-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleClearFlag}
                className="rounded bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:bg-gray-300"
              >
                {isSubmitting ? 'Clearing…' : 'Confirm clear'}
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {mode === 'remove' ? (
          <div className="flex max-w-xs flex-col gap-2">
            <p className="text-xs font-medium text-red-700">This un-publishes paid content. Are you sure?</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for removal (required)"
              rows={2}
              required
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 outline-none focus:border-red-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isSubmitting || reason.trim().length === 0}
                onClick={handleRemove}
                className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:bg-red-300"
              >
                {isSubmitting ? 'Removing…' : 'Confirm remove'}
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
      </td>
    </tr>
  )
}
