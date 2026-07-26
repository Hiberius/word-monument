import HeroCopy from '@/components/hero/HeroCopy'
import MonumentPreview from '@/components/monument/MonumentPreview'
import LiveCounters from '@/components/counters/LiveCounters'
import MessageCalculator from '@/components/hero/MessageCalculator'
import HowItWorks from '@/components/home/HowItWorks'
import MonumentHighlights from '@/components/highlights/MonumentHighlights'
import FinalCta from '@/components/home/FinalCta'
import type { Metadata } from 'next'
import { getMonumentStats } from '@/lib/monumentStats'

// Refresh the ledger numbers roughly every minute rather than shipping a
// client-side polling loop, keeps the homepage inside its JS budget.
export const revalidate = 60

// Canonical + own OG url so the homepage doesn't inherit the static
// openGraph.url from the root layout (which would advertise it on every page).
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
}

// Layout: the grid opens the page (banner), then a two-column band: the
// A/B-tested emotional pitch on the left, the live tally on the right, then
// the "what would you say?" calculator full-width, then the rest.
export default async function HomePage() {
  const stats = await getMonumentStats()

  return (
    <>
      <MonumentPreview />

      <section aria-labelledby="hero-heading" className="relative border-b border-ink bg-parchment">
        {/* Ledger-rule atmosphere: the hairline motif at low opacity. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, var(--color-ink, #1A1710) 0px, var(--color-ink, #1A1710) 1px, transparent 1px, transparent 40px)',
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch lg:gap-14">
            <HeroCopy />
            <LiveCounters stats={stats} />
          </div>
        </div>
      </section>

      <section aria-label="Message calculator" className="border-b border-ink bg-parchment">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
            Try it before you claim it
          </p>
          <h2 className="mt-3 font-headline text-4xl text-ink sm:text-5xl">What would you say?</h2>
          <div className="mt-8">
            <MessageCalculator />
          </div>
        </div>
      </section>

      <HowItWorks />
      <MonumentHighlights />
      <FinalCta />
    </>
  )
}
