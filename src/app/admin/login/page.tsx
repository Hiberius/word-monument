'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

// Utilitarian by design: this is the one internal tool in an otherwise
// public-facing product, so it doesn't need to carry the site's visual
// language. Falls back to plain Tailwind grays since no `parchment` /
// `ink` / `stamp-red` design tokens exist yet in globals.css / tokens.css.
export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const response = await fetch('/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (response.status === 401) {
        setError('Incorrect password.')
        return
      }

      if (response.status === 429) {
        setError('Too many attempts. Try again in a few minutes.')
        return
      }

      if (!response.ok) {
        setError('Something went wrong. Try again.')
        return
      }

      router.push('/admin')
      router.refresh()
    } catch {
      setError('Network error. Try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-300 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Admin access</h1>
        <p className="mt-1 text-sm text-gray-500">Enter the shared admin password to continue.</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || password.length === 0}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
