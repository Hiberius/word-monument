'use client'

// Without this file an uncaught render error falls through to Next's stock
// error screen, which on a live site is both off-brand and alarming. The
// message here is deliberately generic: `error.message` can carry internals
// from a server component, and an error page is not the place to publish
// them. The digest is shown because it is the one thing that makes a report
// actionable, and it is an opaque hash by design.
import { useEffect } from 'react'
import Link from 'next/link'
import { CONTACT_EMAIL } from '@/lib/site'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app/error] unhandled render error', error)
  }, [error])

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-start px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
        Something broke
      </p>

      <h1 className="mt-3 font-headline text-4xl text-ink sm:text-5xl">
        This page did not load.
      </h1>

      <p className="mt-6 max-w-xl font-body text-lg leading-relaxed text-ink-60">
        The fault is ours, not yours. Nothing on the monument is affected by
        this: cells that were paid for are still exactly where they were, and
        if you were part way through a purchase, no charge is made until
        payment actually clears.
      </p>

      {error.digest ? (
        <p className="mt-4 font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
          Reference {error.digest}
        </p>
      ) : null}

      <div className="mt-10 flex flex-wrap items-center gap-6">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-3 border-2 border-ink bg-ink px-8 py-4 font-body text-base font-medium text-parchment transition-all hover:-translate-y-0.5 hover:bg-parchment hover:text-ink focus-visible:-translate-y-0.5 focus-visible:bg-parchment focus-visible:text-ink focus-visible:outline-none"
        >
          Try again
        </button>

        <Link
          href="/"
          className="font-body text-ink-60 underline decoration-ink/40 underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          Back to the front page
        </Link>
      </div>

      <p className="mt-10 font-body text-sm text-ink-60">
        If it keeps happening, tell us at{' '}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
        >
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </div>
  )
}
