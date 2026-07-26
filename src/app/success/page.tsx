import type { Metadata } from 'next'
import Link from 'next/link'
import { getReservationCells } from '@/lib/db/cells'
import CheckoutReceipt from '@/components/checkout/CheckoutReceipt'
import ShareCard from '@/components/share/ShareCard'
import ClearCartOnMount from '@/components/monument/ClearCartOnMount'

export const metadata: Metadata = {
  title: 'Your words are placed',
  description: 'Your cells are on the monument, permanently.',
}

interface SuccessPageProps {
  searchParams: Promise<{ reservationId?: string }>
}

export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  const { reservationId } = await searchParams

  if (!reservationId) {
    return <NotFoundState />
  }

  const reservation = await getReservationCells(reservationId).catch(() => null)
  const soldCells = reservation?.cells.filter((cell) => cell.status === 'sold') ?? []

  if (soldCells.length === 0) {
    return <NotFoundState />
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <ClearCartOnMount />
      <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
        Permanently placed
      </p>
      <h1 className="mt-3 font-headline text-4xl text-ink sm:text-5xl">
        It&rsquo;s yours, forever.
      </h1>
      <p className="mt-4 max-w-lg font-body text-ink-60">
        Your words are on the wall right now, for anyone in the world to find.
        They can never be edited, outbid, or taken down. Thank you for putting
        your name on it.
      </p>

      <div className="mt-10">
        <CheckoutReceipt cells={soldCells} />
      </div>

      <div className="mt-8">
        <ShareCard reservationId={reservationId} />
      </div>

      <Link
        href="/monument"
        className="mt-10 inline-flex items-center gap-3 font-body text-sm text-ink-60 underline decoration-ink/30 underline-offset-4 hover:text-ink hover:decoration-ink"
      >
        &larr; Claim more cells
      </Link>
    </div>
  )
}

function NotFoundState() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start px-4 py-24 sm:px-6 lg:px-8">
      <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
        Nothing here yet
      </p>
      <h1 className="mt-3 font-headline text-3xl text-ink sm:text-4xl">
        We couldn&rsquo;t find that order.
      </h1>
      <p className="mt-4 font-body text-ink-60">
        The link may be incomplete, or the purchase hasn&rsquo;t finished processing
        yet. If you just paid, give it a moment and check your email receipt.
      </p>
      <Link
        href="/monument"
        className="mt-8 inline-flex items-center gap-3 border-2 border-ink bg-ink px-6 py-3 font-body text-sm font-medium text-parchment transition-colors hover:border-stamp-red hover:bg-stamp-red focus-visible:border-stamp-red focus-visible:bg-stamp-red focus-visible:outline-none"
      >
        Back to the monument
        <span aria-hidden="true">&rarr;</span>
      </Link>
    </div>
  )
}
