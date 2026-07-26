import type { Metadata } from 'next'
import MonumentExplorerLoader from '@/components/monument/MonumentExplorerLoader'

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

export default function MonumentPage() {
  return (
    <div className="h-[calc(100vh-4.5rem)] w-full">
      <MonumentExplorerLoader />
    </div>
  )
}
