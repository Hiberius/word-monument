import ReceiptCard from '@/components/checkout/ReceiptCard'
import { groupCellsIntoWords } from '@/lib/wordGrouping'
import { CELL_PRICE_CENTS } from '@/lib/config'
import { formatUSD, formatDate } from '@/lib/format'
import type { Cell } from '@/lib/types'

interface CheckoutReceiptProps {
  cells: Cell[]
}

export default function CheckoutReceipt({ cells }: CheckoutReceiptProps) {
  const words = groupCellsIntoWords(cells)
  const totalCents = cells.length * CELL_PRICE_CENTS
  const placedAt = cells.find((cell) => cell.purchasedAt)?.purchasedAt

  return (
    <div className="relative">
      <ReceiptCard eyebrow="Confirmed">
        <p className="whitespace-pre-line font-headline text-3xl leading-snug text-ink sm:text-4xl">
          {words.map((w) => w.text).join(' ')}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-rule pt-5 font-body text-sm">
          <div>
            <dt className="text-ink-60">Cells placed</dt>
            <dd className="mt-1 font-mono-grid text-ink">{cells.length}</dd>
          </div>
          <div>
            <dt className="text-ink-60">Amount</dt>
            <dd className="mt-1 font-mono-grid text-ink">{formatUSD(totalCents)}</dd>
          </div>
          {placedAt ? (
            <div className="col-span-2">
              <dt className="text-ink-60">Placed</dt>
              <dd className="mt-1 font-mono-grid text-ink">{formatDate(placedAt)}</dd>
            </div>
          ) : null}
        </dl>
      </ReceiptCard>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 -top-4 flex h-20 w-20 rotate-[-9deg] items-center justify-center rounded-full border-[3px] border-ink sm:-right-4 sm:-top-6 sm:h-24 sm:w-24"
      >
        <span className="font-mono-grid text-[10px] font-bold uppercase tracking-widest text-ink sm:text-xs">
          Placed
          <br />
          for good
        </span>
      </div>
    </div>
  )
}
