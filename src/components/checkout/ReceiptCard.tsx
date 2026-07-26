interface ReceiptCardProps {
  eyebrow: string
  children: React.ReactNode
  className?: string
}

/** Shared ledger-receipt visual shell used by the checkout summary and the success stamp. */
export default function ReceiptCard({ eyebrow, children, className = '' }: ReceiptCardProps) {
  return (
    <div className={`border border-ink bg-parchment ${className}`}>
      <div className="border-b border-ink px-6 py-3">
        <p className="font-mono-grid text-[11px] uppercase tracking-[0.2em] text-ink-60">
          {eyebrow}
        </p>
      </div>
      <div className="px-6 py-6">{children}</div>
    </div>
  )
}
