import type { Metadata } from 'next'
import MonumentExplorerLoader from '@/components/monument/MonumentExplorerLoader'
import MonumentIntro from '@/components/monument/MonumentIntro'

// The intro band's counts come from the ledger, so the page can't be frozen at
// build time. Same 60s window the homepage tally uses.
export const revalidate = 60

export const metadata: Metadata = {
  title: 'The Monument',
  description:
    'Walk the grid, claim your cells, and spell out the words you want permanently placed.',
  alternates: { canonical: '/monument' },
  openGraph: {
    url: '/monument',
    title: 'The Monument - Word Monument',
    description:
      'Walk the grid, claim your cells, and spell out the words you want permanently placed.',
  },
}

// The explorer needs a definite height (its canvas is h-full), so the viewport
// column is split with flex rather than by subtracting a hardcoded band height
// from the calc: the band is free to wrap on narrow screens without the canvas
// overflowing the viewport.
export default function MonumentPage() {
  return (
    <div className="flex h-[calc(100dvh-4.5rem)] w-full flex-col">
      <MonumentIntro />
      <div className="min-h-0 flex-1">
        <MonumentExplorerLoader />
      </div>
    </div>
  )
}
