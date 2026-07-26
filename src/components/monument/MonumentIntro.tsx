import { getMonumentStats } from '@/lib/monumentStats'
import { formatCount } from '@/lib/format'

// The grid below is a canvas drawn with fillText and loaded with ssr:false, so
// it contributes nothing to the server-rendered HTML: without this band the
// most important page on the site ships with no heading, no copy and no
// numbers for a crawler, and nothing at all for a visitor waiting on the
// explorer bundle. Kept to a single compact row so the canvas keeps almost the
// whole viewport (the page wraps this in a flex column, so the band's real
// height is subtracted from the canvas automatically, whatever the copy wraps
// to at a given width).
export default async function MonumentIntro() {
  const stats = await getMonumentStats()

  return (
    <header className="shrink-0 border-b border-ink bg-parchment px-4 py-2 sm:px-6 sm:py-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-headline text-xl leading-none text-ink sm:text-2xl">The Monument</h1>

        <p className="order-3 w-full font-body text-[11px] leading-snug text-ink-60 sm:order-none sm:w-auto sm:flex-1 sm:text-xs">
          One million cells, one character each, $1 to keep one forever. Drag to move, scroll or
          pinch to zoom, then tap a cell to claim it.
        </p>

        <p className="ml-auto shrink-0 font-mono-grid text-[11px] uppercase tracking-[0.14em] text-ink-60 sm:ml-0 sm:text-xs">
          {formatCount(stats.cellsSold)} claimed
          <span aria-hidden="true" className="px-1.5">
            &middot;
          </span>
          {formatCount(stats.cellsRemaining)} of {formatCount(stats.totalCells)} left
        </p>
      </div>
    </header>
  )
}
