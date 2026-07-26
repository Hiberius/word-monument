import type { Metadata } from 'next'
import Link from 'next/link'
import { getReservationCells } from '@/lib/db/cells'
import OrderSummary from '@/components/checkout/OrderSummary'
import ReceiptCard from '@/components/checkout/ReceiptCard'
import CheckoutForm from '@/components/checkout/CheckoutForm'

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Review your cells and complete payment to place your words permanently.',
}

interface CheckoutPageProps {
  searchParams: Promise<{ reservationId?: string }>
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const { reservationId } = await searchParams

  if (!reservationId) {
    return <ExpiredState />
  }

  const reservation = await getReservationCells(reservationId).catch(() => null)

  if (!reservation || !reservation.valid || reservation.cells.length === 0) {
    return <ExpiredState />
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
        Review &amp; pay
      </p>
      <h1 className="mt-3 font-headline text-4xl text-ink sm:text-5xl">
        Almost yours, forever.
      </h1>
      <p className="mt-4 max-w-xl font-body text-ink-60">
        Your cells are held for you while you check out. Once payment clears, they&rsquo;re
        placed on the wall for good.
      </p>

      {reservation.reservedUntil ? (
        <p className="mt-2 font-mono-grid text-xs text-ink-60">
          Held until {new Date(reservation.reservedUntil).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      ) : null}

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <OrderSummary cells={reservation.cells} />

        <ReceiptCard eyebrow="Verify & pay">
          <p className="mb-5 font-body text-sm text-ink-60">
            One quick check to keep the monument free of bots, then off to secure
            payment.
          </p>
          <CheckoutForm reservationId={reservationId} />
        </ReceiptCard>
      </div>
    </div>
  )
}

function ExpiredState() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-stamp-red">
        Reservation expired
      </p>
      <h1 className="mt-3 font-headline text-3xl text-ink sm:text-4xl">
        This hold has run out.
      </h1>
      <p className="mt-4 font-body text-ink-60">
        Cell reservations are held for a limited window so the grid stays fair for
        everyone. This one is no longer valid, but the cells are probably still
        open. Head back and claim them again.
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
