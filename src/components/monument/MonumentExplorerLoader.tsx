'use client'

import dynamic from 'next/dynamic'

// The explorer owns a heavy canvas/rendering bundle - keep it fully client-side
// and out of every other route's chunk graph. `ssr: false` requires this to
// live in a Client Component; the page itself stays a Server Component.
const MonumentExplorer = dynamic(() => import('@/components/monument/MonumentExplorer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-parchment">
      <p className="font-mono-grid text-sm text-ink-60">Unrolling the ledger&hellip;</p>
    </div>
  ),
})

export default function MonumentExplorerLoader() {
  return <MonumentExplorer />
}
