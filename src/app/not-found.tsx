// Next ships a stock 404 (black Helvetica on white) that has nothing to do
// with this site. It is also the page people are most likely to hit from the
// outside: a mistyped URL, a stale link in an article, a share card that
// outlived the thing it pointed at. Worth being on-brand and worth pointing
// somewhere useful rather than being a dead end.
import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_URL, SITE_OG_IMAGE } from '@/lib/site'

const description = 'That address is not part of the monument.'

export const metadata: Metadata = {
  title: 'Not found',
  description,
  // Noindex: a 404 that gets indexed competes with the real pages for the
  // same queries.
  robots: { index: false, follow: true },
  openGraph: {
    url: SITE_URL,
    title: 'Not found',
    description,
    images: [SITE_OG_IMAGE],
  },
}

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-start px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">Error 404</p>

      <h1 className="mt-3 font-headline text-4xl text-ink sm:text-5xl">
        This cell is not on the wall.
      </h1>

      <p className="mt-6 max-w-xl font-body text-lg leading-relaxed text-ink-60">
        There is nothing at this address. A million cells exist and this is not
        one of them, so either the link was mistyped or it points at something
        that was never here. The monument itself is where it has always been.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-6">
        <Link
          href="/monument"
          className="inline-flex items-center gap-3 border-2 border-ink bg-ink px-8 py-4 font-body text-base font-medium text-parchment transition-all hover:-translate-y-0.5 hover:bg-parchment hover:text-ink focus-visible:-translate-y-0.5 focus-visible:bg-parchment focus-visible:text-ink focus-visible:outline-none"
        >
          Walk the grid <span aria-hidden="true">&rarr;</span>
        </Link>

        <Link
          href="/"
          className="font-body text-ink-60 underline decoration-ink/40 underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          Back to the front page
        </Link>
      </div>
    </div>
  )
}
