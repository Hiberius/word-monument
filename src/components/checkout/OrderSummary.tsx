import ReceiptCard from '@/components/checkout/ReceiptCard'
import { groupCellsIntoWords } from '@/lib/wordGrouping'
import { CELL_PRICE_CENTS } from '@/lib/config'
import { formatUSD } from '@/lib/format'
import type { Cell } from '@/lib/types'

interface OrderSummaryProps {
  cells: Cell[]
}

export default function OrderSummary({ cells }: OrderSummaryProps) {
  const words = groupCellsIntoWords(cells)
  const totalCents = cells.length * CELL_PRICE_CENTS

  return (
    <ReceiptCard eyebrow="Order summary">
      <ul className="divide-y divide-rule">
        {words.map((word) => (
          <li key={`${word.y}-${word.startX}`} className="flex items-baseline justify-between gap-4 py-3 first:pt-0">
            <div>
              <p className="font-headline text-lg text-ink">{word.text}</p>
              <p className="font-mono-grid text-[11px] text-ink-60">
                Row {word.y.toLocaleString('en-US')}, starting col {word.startX.toLocaleString('en-US')}
              </p>
            </div>
            <p className="whitespace-nowrap font-mono-grid text-sm text-ink-60">
              {word.text.length} &times; $1.00
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-1 border-t border-ink pt-4">
        <div className="flex items-center justify-between font-body text-sm text-ink-60">
          <span>{cells.length} {cells.length === 1 ? 'cell' : 'cells'} at $1.00</span>
          <span className="font-mono-grid">{formatUSD(totalCents)}</span>
        </div>
        <div className="flex items-center justify-between font-headline text-xl text-ink">
          <span>Total</span>
          <span className="font-mono-grid">{formatUSD(totalCents)}</span>
        </div>
      </div>
    </ReceiptCard>
  )
}
