'use client'

import { useState } from 'react'

interface ConfirmPayButtonProps {
  reservationId: string
  turnstileToken: string | null
}

export default function ConfirmPayButton({ reservationId, turnstileToken }: ConfirmPayButtonProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!turnstileToken) {
      setError('Please complete the verification above first.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId, turnstileToken }),
      })

      const data = (await response.json().catch(() => null)) as { checkoutUrl?: string; error?: string } | null

      if (!response.ok || !data?.checkoutUrl) {
        setError(data?.error ?? 'Something went wrong starting checkout. Please try again.')
        setSubmitting(false)
        return
      }

      window.location.href = data.checkoutUrl
    } catch {
      setError('Network error - please check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !turnstileToken}
        className="w-full border-2 border-ink bg-ink px-6 py-4 font-body text-base font-medium text-parchment transition-colors hover:border-stamp-red hover:bg-stamp-red disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink disabled:hover:bg-ink focus-visible:border-stamp-red focus-visible:bg-stamp-red focus-visible:outline-none"
      >
        {submitting ? 'Placing your words…' : 'Confirm and pay'}
      </button>
      {error ? (
        <p role="alert" className="mt-3 font-body text-sm text-stamp-red">
          {error}
        </p>
      ) : null}
    </div>
  )
}
