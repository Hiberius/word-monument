import { getMonumentHighlights } from '@/lib/highlights'

export default async function MonumentHighlights() {
  const highlights = await getMonumentHighlights()

  if (highlights.length === 0) return null

  return (
    <section aria-labelledby="highlights-heading" className="border-b border-ink">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-2xl">
          <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
            From the ledger
          </p>
          <h2 id="highlights-heading" className="mt-3 font-headline text-4xl text-ink sm:text-5xl">
            Words already placed
          </h2>
          <p className="mt-4 font-body text-ink-60">
            A handful of entries, pulled straight from the wall - permanent the moment
            they were paid for.
          </p>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-px border border-rule bg-ink/15 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((highlight, index) => (
            <li key={highlight.reservationId} className="bg-parchment p-6">
              <p className="font-mono-grid text-[11px] text-ink-60">
                Row {highlight.y.toLocaleString('en-US')}, Col {highlight.x.toLocaleString('en-US')}
              </p>
              <p className="mt-3 whitespace-pre-line font-headline text-2xl leading-snug text-ink">
                {highlight.message}
              </p>
              <p className="mt-4 font-mono-grid text-[11px] text-ink-60">
                Entry {String(index + 1).padStart(3, '0')}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
