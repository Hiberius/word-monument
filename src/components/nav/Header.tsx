import Link from 'next/link'
import MobileNav from '@/components/nav/MobileNav'
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

        <MobileNav links={NAV_LINKS} />
      </div>

      {/* Ledger double-rule: the hairline motif that carries through every surface. */}
      <div className="border-b border-ink" />
      <div className="mx-4 border-b border-rule sm:mx-6 lg:mx-8" />
    </header>
  )
}
