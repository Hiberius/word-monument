'use client'

import { useEffect, useState } from 'react'
import AnimatedCounter from '@/components/counters/AnimatedCounter'
import type { Format } from '@number-flow/react'
import type { MonumentStats } from '@/lib/monumentStats'

interface LiveCountersProps {
  stats: MonumentStats
}

const USD_FORMAT: Format = {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
}

// The right column of the homepage: a self-contained ink "register" card that
// holds its own against the parchment pitch on the left, stretching to match
// its height. Stats stack vertically; the remaining-cell count (the scarcity
// that drives the whole product) is set on a stamp-red block so it reads as
// the headline figure.
export default function LiveCounters({ stats }: LiveCountersProps) {
  // Values start at zero and step up to the real figures once mounted, so the
  // ledger numbers feel tallied rather than simply printed on the page.
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setRevealed(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const shown = revealed
    ? stats
    : { ...stats, cellsSold: 0, cellsRemaining: 0, totalRevenueCents: 0 }

  return (
    <div className="flex h-full flex-col bg-ink text-parchment">
      <div className="border-b border-parchment/15 px-6 py-5">
        <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-parchment/60">
          The tally, right now
        </p>
      </div>

      <div className="flex-1 divide-y divide-parchment/15">
        <StatRow label="Cells claimed">
          <AnimatedCounter value={shown.cellsSold} />
        </StatRow>

        {/* Revenue counts real purchases only. The founding inscriptions were
            placed by us and nobody paid for them (see /about), so this figure
            legitimately reads zero while the grid already shows 72 filled
            cells. Printed side by side those two numbers just look like a
            broken widget, so the row stays hidden until the first sale makes
            it say something. */}
        {stats.totalRevenueCents > 0 && (
          <StatRow label="Written in stone so far">
            <AnimatedCounter value={shown.totalRevenueCents / 100} format={USD_FORMAT} />
          </StatRow>
        )}

        <StatRow
          emphasized
          label={`Remaining of ${stats.totalCells.toLocaleString('en-US')}`}
          footnote={<>Every cell sells exactly once, for $1. When they&rsquo;re gone, they&rsquo;re gone.</>}
        >
          <AnimatedCounter value={shown.cellsRemaining} />
        </StatRow>
      </div>
    </div>
  )
}

function StatRow({
  label,
  footnote,
  emphasized,
  children,
}: {
  label: string
  footnote?: React.ReactNode
  emphasized?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1.5 px-6 py-5 ${emphasized ? 'bg-stamp-red' : ''}`}>
      <p className="font-mono-grid text-3xl text-parchment sm:text-4xl">{children}</p>
      <p
        className={`font-mono-grid text-xs uppercase tracking-[0.2em] ${
          emphasized ? 'text-parchment' : 'text-parchment/60'
        }`}
      >
        {label}
      </p>
      {footnote ? (
        <p className={`font-body text-[11px] leading-snug ${emphasized ? 'text-parchment/90' : 'text-parchment/50'}`}>
          {footnote}
        </p>
      ) : null}
    </div>
  )
}
