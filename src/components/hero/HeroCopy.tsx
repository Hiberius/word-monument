'use client'

import Link from 'next/link'
import { useHeroVariant } from '@/lib/hero/useHeroVariant'

// The left column of the homepage hero: the A/B-tested emotional pitch.
// Headline + subcopy come from the session's assigned variant (see
// useHeroVariant); the CTA and price line are constant. Server-renders the
// default variant, swaps to the assigned one after mount.
export default function HeroCopy() {
  const variant = useHeroVariant()

  return (
    <div>
      <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
        Entry No. 000,000,001. Open now
      </p>

      <h1
        id="hero-heading"
        className="mt-5 font-headline text-[clamp(2.5rem,4.5vw+1rem,5rem)] leading-[1.0] text-ink"
      >
        {variant.headline}
      </h1>

      <p className="mt-6 max-w-xl font-body text-lg leading-relaxed text-ink-60 sm:text-xl">
        {variant.subcopy}
      </p>

      <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Link
          href="/monument"
          className="group inline-flex items-center gap-3 border-2 border-ink bg-ink px-7 py-4 font-body text-base font-medium text-parchment transition-all hover:-translate-y-0.5 hover:border-stamp-red hover:bg-stamp-red focus-visible:-translate-y-0.5 focus-visible:border-stamp-red focus-visible:bg-stamp-red focus-visible:outline-none"
        >
          Claim your cell
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
            &rarr;
          </span>
        </Link>
        <p className="font-mono-grid text-xs text-ink-60">
          $1.00 / letter &middot; placed the moment you pay
        </p>
      </div>
    </div>
  )
}
