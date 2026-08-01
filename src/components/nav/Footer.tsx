import Link from 'next/link'
import { SITE_NAME } from '@/lib/site'

const EXPLORE_LINKS = [
  { href: '/monument', label: 'The monument' },
  { href: '/about', label: 'Our story' },
  { href: '/notes', label: 'Notes' },
]

const LEGAL_LINKS = [
  { href: '/content-policy', label: 'Content policy' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
]

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto bg-parchment">
      <div className="mx-4 border-t border-ink sm:mx-6 lg:mx-8" />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-2">
            <p className="font-headline text-xl text-ink">{SITE_NAME}</p>
            <p className="mt-3 max-w-sm font-body text-sm leading-relaxed text-ink-60">
              A monument built one word at a time. One dollar. One letter. Yours,
              forever. Once a word is placed, it never comes down.
            </p>
          </div>

          <div>
            <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">Explore</p>
            <ul className="mt-3 space-y-2">
              {EXPLORE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="font-body text-sm text-ink-60 underline-offset-4 hover:text-ink hover:underline focus-visible:text-ink focus-visible:underline focus-visible:outline-none"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">Policy</p>
            <ul className="mt-3 space-y-2">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="font-body text-sm text-ink-60 underline-offset-4 hover:text-ink hover:underline focus-visible:text-ink focus-visible:underline focus-visible:outline-none"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-rule pt-6 font-mono-grid text-xs text-ink-60 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {year} {SITE_NAME}. Every cell, permanently placed.</p>
          <p>Built one word at a time.</p>
        </div>
      </div>
    </footer>
  )
}
