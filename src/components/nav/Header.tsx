import Link from 'next/link'
import { SITE_NAME } from '@/lib/site'

const NAV_LINKS = [
  { href: '/monument', label: 'The Monument' },
  { href: '/about', label: 'About' },
] as const

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-parchment/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="font-headline text-lg tracking-tight text-ink transition-opacity hover:opacity-70 focus-visible:opacity-70 focus-visible:outline-none"
        >
          {SITE_NAME}
          <span className="text-ink-60">.</span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-body text-sm text-ink-60 underline decoration-ink/0 decoration-1 underline-offset-4 transition-all hover:text-ink hover:decoration-ink/40 focus-visible:text-ink focus-visible:decoration-stamp-red focus-visible:outline-none"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/monument"
            className="border border-ink bg-ink px-4 py-2 font-body text-sm text-parchment transition-colors hover:bg-stamp-red hover:border-stamp-red focus-visible:bg-stamp-red focus-visible:border-stamp-red focus-visible:outline-none"
          >
            Claim your cell
          </Link>
        </nav>

        <details className="group relative md:hidden">
          <summary
            className="flex h-10 w-10 cursor-pointer list-none items-center justify-center border border-rule text-ink [&::-webkit-details-marker]:hidden"
            aria-label="Open menu"
          >
            <span className="sr-only">Menu</span>
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
              <path d="M0 1H18" stroke="currentColor" strokeWidth="1.5" />
              <path d="M0 7H18" stroke="currentColor" strokeWidth="1.5" />
              <path d="M0 13H18" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </summary>
          <nav
            aria-label="Mobile navigation"
            className="absolute right-0 top-[calc(100%+1px)] flex w-56 flex-col border border-rule bg-parchment shadow-[4px_4px_0_0_var(--rule-color)]"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="border-b border-rule px-4 py-3 font-body text-sm text-ink-60 last:border-b-0 hover:bg-ink/[0.03] hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/monument"
              className="bg-ink px-4 py-3 text-center font-body text-sm text-parchment hover:bg-stamp-red"
            >
              Claim your cell
            </Link>
          </nav>
        </details>
      </div>

      {/* Ledger double-rule: the hairline motif that carries through every surface. */}
      <div className="border-b border-ink" />
      <div className="mx-4 border-b border-rule sm:mx-6 lg:mx-8" />
    </header>
  )
}
