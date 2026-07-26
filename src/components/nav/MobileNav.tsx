'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

interface NavLink {
  href: string
  label: string
}

// A bare <details> keeps the menu usable before hydration, but it has no idea
// the route changed: after a client-side navigation the panel stays open over
// the new page, and a tap outside never dismisses it. Closing it on those
// signals (plus Escape) is the whole reason this is a Client Component.
export default function MobileNav({ links }: { links: readonly NavLink[] }) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    detailsRef.current?.removeAttribute('open')
  }, [pathname])

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      const details = detailsRef.current
      if (!details?.open) return
      if (event.target instanceof Node && details.contains(event.target)) return
      details.removeAttribute('open')
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      const details = detailsRef.current
      if (!details?.open) return
      details.removeAttribute('open')
      details.querySelector('summary')?.focus()
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  return (
    <details ref={detailsRef} className="group relative md:hidden">
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
        {links.map((link) => (
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
  )
}
