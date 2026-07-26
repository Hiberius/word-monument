import Link from 'next/link'

export default function FinalCta() {
  return (
    <section aria-labelledby="final-cta-heading" className="border-b border-ink bg-ink">
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
        <h2 id="final-cta-heading" className="font-headline text-4xl text-parchment sm:text-5xl">
          Your words, permanently placed.
        </h2>
        <p className="mx-auto mt-5 max-w-lg font-body text-parchment/70">
          Pick a cell. Spell it out. It stays up for good. No edits, no resale,
          no expiry. A dollar a letter, forever.
        </p>
        <Link
          href="/monument"
          className="mt-9 inline-flex items-center gap-3 border-2 border-stamp-red bg-stamp-red px-8 py-4 font-body text-base font-medium text-parchment transition-all hover:-translate-y-0.5 hover:bg-parchment hover:text-stamp-red focus-visible:-translate-y-0.5 focus-visible:bg-parchment focus-visible:text-stamp-red focus-visible:outline-none"
        >
          Claim your cell
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </section>
  )
}
