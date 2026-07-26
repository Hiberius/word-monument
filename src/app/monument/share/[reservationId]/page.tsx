import type { Metadata } from 'next'
import Link from 'next/link'
import { cache } from 'react'
import ReceiptCard from '@/components/checkout/ReceiptCard'
import { getReservationCells } from '@/lib/db/cells'
import { formatDate } from '@/lib/format'
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/site'
import { assembleMessage, groupCellsIntoWords } from '@/lib/wordGrouping'

// The public face of a purchase. Every share of a real inscription points
// here rather than at /monument, so the link unfurls with that buyer's own
// words (via /api/share-image/<id>) instead of the generic site card. This
// page is therefore crawler-facing: it must render for a stranger who has
// never seen the product, and must survive a reservation that does not exist.

// Inscriptions are permanent once sold, so the page is cacheable. The window
// stays short because a link can be opened while the Stripe webhook is still
// in flight, and a "not found" render must not stick.
export const revalidate = 300

interface Inscription {
  text: string
  cellCount: number
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
  placedAt: string | null
}

interface SharePageProps {
  params: Promise<{ reservationId: string }>
}

function pad4(n: number): string {
  return String(n).padStart(4, '0')
}

/** Single-line form of a possibly multi-row inscription, for metadata strings. */
function oneLine(text: string, maxLength: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > maxLength ? `${flat.slice(0, maxLength)}...` : flat
}

/**
 * generateMetadata and the page body need the same reservation, and Supabase
 * queries are not deduplicated by Next's fetch cache, so the read is memoized
 * for the render pass instead of running twice on every crawl.
 */
const loadInscription = cache(async (reservationId: string): Promise<Inscription | null> => {
  // Throws when Supabase is not configured at all (demo deployments), which is
  // the same "nothing to show" outcome as an unknown reservation.
  const reservation = await getReservationCells(reservationId).catch(() => null)
  const sold = reservation?.cells.filter((cell) => cell.status === 'sold' && cell.character) ?? []

  if (sold.length === 0) {
    return null
  }

  const xs = sold.map((cell) => cell.x)
  const ys = sold.map((cell) => cell.y)

  return {
    text: assembleMessage(groupCellsIntoWords(sold)),
    cellCount: sold.length,
    rowStart: Math.min(...ys),
    rowEnd: Math.max(...ys),
    colStart: Math.min(...xs),
    colEnd: Math.max(...xs),
    placedAt: sold.find((cell) => cell.purchasedAt)?.purchasedAt ?? null,
  }
})

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { reservationId } = await params
  const inscription = await loadInscription(reservationId)

  // The id lands inside absolute URLs that go out as og:url and og:image, so
  // it is encoded rather than interpolated raw.
  const safeId = encodeURIComponent(reservationId)
  const pageUrl = `${SITE_URL}/monument/share/${safeId}`
  // Renders a generic card for an unknown reservation, so it is worth pointing
  // at even on the fallback branch.
  const imageUrl = `${SITE_URL}/api/share-image/${safeId}`

  const title = inscription
    ? `“${oneLine(inscription.text, 42)}” is on the monument, forever`
    : `${SITE_NAME} - ${SITE_TAGLINE}`

  const description = inscription
    ? `${inscription.cellCount} ${inscription.cellCount === 1 ? 'cell' : 'cells'} at row ${pad4(inscription.rowStart)}, columns ${pad4(inscription.colStart)} to ${pad4(inscription.colEnd)}. One dollar, one letter, and it never comes down. Claim your own cells.`
    : SITE_DESCRIPTION

  const imageAlt = inscription
    ? `A certificate card showing “${oneLine(inscription.text, 42)}” placed on the Word Monument`
    : `A card from the ${SITE_NAME} monument`

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: 'article',
      url: pageUrl,
      title,
      description,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  }
}

export default async function SharePage({ params }: SharePageProps) {
  const { reservationId } = await params
  const inscription = await loadInscription(reservationId)

  if (!inscription) {
    return <NotFoundState />
  }

  const rowLabel =
    inscription.rowStart === inscription.rowEnd
      ? pad4(inscription.rowStart)
      : `${pad4(inscription.rowStart)}-${pad4(inscription.rowEnd)}`

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
        Entry on the monument
      </p>
      <h1 className="mt-3 font-headline text-4xl text-ink sm:text-5xl">
        Someone put this here, for good.
      </h1>
      <p className="mt-4 max-w-lg font-body text-ink-60">
        These cells were bought once and are held forever. They can never be
        edited, outbid, or taken down. The wall around them is still mostly
        empty.
      </p>

      <div className="mt-10">
        <ReceiptCard eyebrow="Inscription">
          <p className="whitespace-pre-line font-headline text-3xl leading-snug text-ink sm:text-4xl">
            {inscription.text}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-rule pt-5 font-body text-sm">
            <div>
              <dt className="text-ink-60">Row</dt>
              <dd className="mt-1 font-mono-grid text-ink">{rowLabel}</dd>
            </div>
            <div>
              <dt className="text-ink-60">Columns</dt>
              <dd className="mt-1 font-mono-grid text-ink">
                {pad4(inscription.colStart)}-{pad4(inscription.colEnd)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-60">Cells</dt>
              <dd className="mt-1 font-mono-grid text-ink">{inscription.cellCount}</dd>
            </div>
            {inscription.placedAt ? (
              <div>
                <dt className="text-ink-60">Placed</dt>
                <dd className="mt-1 font-mono-grid text-ink">{formatDate(inscription.placedAt)}</dd>
              </div>
            ) : null}
          </dl>
        </ReceiptCard>
      </div>

      <div className="mt-12 border-t border-rule pt-10">
        <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
          Your turn
        </p>
        <h2 className="mt-3 font-headline text-3xl text-ink">
          Put your own words on the wall.
        </h2>
        <p className="mt-4 max-w-lg font-body text-ink-60">
          One dollar a letter. Pick empty cells anywhere on the grid, type your
          word into them, and it stays exactly where you put it. No renewals, no
          expiry, no second chance to buy the same cell.
        </p>
        <Link
          href="/monument"
          className="mt-7 inline-flex items-center gap-3 border-2 border-ink bg-ink px-6 py-3 font-body text-sm font-medium text-parchment transition-colors hover:border-stamp-red hover:bg-stamp-red focus-visible:border-stamp-red focus-visible:bg-stamp-red focus-visible:outline-none"
        >
          Claim your cells
          <span aria-hidden="true">&rarr;</span>
        </Link>
        <p className="mt-6 font-body text-sm text-ink-60">
          <Link
            href="/about"
            className="underline decoration-ink/30 underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            What is {SITE_NAME}?
          </Link>
        </p>
      </div>
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
        We couldn&rsquo;t find that inscription.
      </h1>
      <p className="mt-4 font-body text-ink-60">
        The link may be incomplete, or the purchase behind it hasn&rsquo;t
        finished processing yet. The monument itself is still there, and most of
        it is still empty.
      </p>
      <Link
        href="/monument"
        className="mt-8 inline-flex items-center gap-3 border-2 border-ink bg-ink px-6 py-3 font-body text-sm font-medium text-parchment transition-colors hover:border-stamp-red hover:bg-stamp-red focus-visible:border-stamp-red focus-visible:bg-stamp-red focus-visible:outline-none"
      >
        Open the monument
        <span aria-hidden="true">&rarr;</span>
      </Link>
    </div>
  )
}
