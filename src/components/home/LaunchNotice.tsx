'use client'

import { useRef, useState } from 'react'

type FormState = 'idle' | 'submitting' | 'done'

/**
 * Preview-state notice + notify list, rendered ONLY while the site runs
 * without a backend (the parent gates on isSupabaseConfigured(), which is
 * inlined at build time, so connecting Supabase and rebuilding removes this
 * component everywhere at once).
 *
 * It exists because the alternative was measurably worse: a visitor typed a
 * word, walked the whole placement flow, pressed checkout, and only THEN hit
 * the preview wall, with no way to be told when buying opens. The wall now
 * announces itself up front and converts the dead end into an address.
 *
 * Two details are load-bearing:
 * - The status element is ALWAYS mounted and doubles as the focus target on
 *   success. A live region inserted together with its content is not reliably
 *   announced, and unmounting the submit button while it holds focus would
 *   drop keyboard users at the top of the document.
 * - Errors replace the subtitle text instead of opening a new block, so the
 *   strip never changes height. On /monument it sits above a canvas that is
 *   sized from the remaining flex space, and a growing strip would visibly
 *   resize the monument under the visitor's pointer.
 */
export default function LaunchNotice({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<FormState>('idle')
  const [error, setError] = useState<string | null>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state === 'submitting') return

    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '')
    const website = String(data.get('website') ?? '')

    setState('submitting')
    setError(null)

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website }),
      })
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null

      if (response.ok && body?.ok) {
        setState('done')
        // Move focus onto the always-mounted status line so a keyboard user
        // is not left on a button that no longer exists.
        requestAnimationFrame(() => statusRef.current?.focus())
        return
      }

      setError(body?.error ?? 'Something went wrong. Please try again.')
      setState('idle')
    } catch {
      setError('Network error. Please check your connection and try again.')
      setState('idle')
    }
  }

  return (
    // shrink-0 matters on /monument, where this sits inside the page's flex
    // column and must never be squashed by the canvas below it. The compact
    // variant hides itself on very short viewports (landscape phones): there
    // the canvas is the page, and a 44px strip is the difference between a
    // usable monument and a letterbox.
    <div
      id="notify"
      className={`shrink-0 border-b border-ink bg-parchment-aged ${
        compact ? '[@media(max-height:480px)]:hidden' : ''
      }`}
    >
      <div
        className={`mx-auto flex max-w-7xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8 ${
          compact ? 'py-2.5' : 'py-4'
        }`}
      >
        <p className="font-mono-grid text-xs uppercase tracking-[0.18em] text-ink">
          <span className="mr-2 inline-block border border-stamp-red px-1.5 py-0.5 text-[10px] font-semibold text-stamp-red">
            Preview
          </span>
          Claiming is not open yet.
          {error ? (
            <span role="alert" className="ml-1 normal-case tracking-normal text-stamp-red">
              {error}
            </span>
          ) : (
            <span className="ml-1 normal-case tracking-normal text-ink-60">
              One email when it is, nothing else.
            </span>
          )}
        </p>

        {/* One slot holds either the form or the confirmation, at a fixed
            minimum height. Swapping a 38px form for a line of text would
            otherwise shrink the strip, and on /monument the canvas is sized
            from the leftover flex space, so a successful signup would visibly
            resize the monument under the visitor's pointer. */}
        <div className="flex min-h-[38px] w-full max-w-md items-center sm:ml-auto">
          {/* Always mounted so assistive tech sees the region before its
              content changes, and so focus has somewhere to land when the
              submit button goes away. */}
          <p
            ref={statusRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
            className={
              state === 'done'
                ? 'w-full font-mono-grid text-xs uppercase tracking-[0.14em] text-ink outline-none sm:text-right'
                : 'sr-only'
            }
          >
            {state === 'done' ? 'On the list.' : ''}
          </p>

          {state !== 'done' && (
            <form onSubmit={handleSubmit} className="flex w-full items-stretch gap-0">
              {/* Honeypot: hidden from people, findable by bots. Kept out of
                  the accessibility tree and the tab order on purpose. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] h-px w-px opacity-0"
              />
              <label htmlFor="notify-email" className="sr-only">
                Email address
              </label>
              <input
                id="notify-email"
                type="email"
                name="email"
                required
                maxLength={254}
                placeholder="you@example.com"
                autoComplete="email"
                className="min-w-0 flex-1 border border-ink bg-parchment px-3 py-2 font-mono-grid text-sm text-ink placeholder:text-ink-60/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              />
              <button
                type="submit"
                disabled={state === 'submitting'}
                className="shrink-0 border border-l-0 border-stamp-red bg-stamp-red px-4 py-2 font-body text-sm font-medium text-parchment transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:pointer-events-none disabled:opacity-60"
              >
                {state === 'submitting' ? 'Adding…' : 'Notify me'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
