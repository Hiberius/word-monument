import Link from 'next/link'
import Image from 'next/image'

/**
 * Typographic primitives for long-form writing, in the Civic Ledger voice.
 *
 * Notes are authored as TSX rather than markdown on purpose. A markdown
 * renderer would be the seventh runtime dependency in a project whose whole
 * argument is that six is a verification budget, and the alternative,
 * hand-rolling a parser, is a bug surface with no upside for content that
 * ships from this repo and never comes from a user.
 */

export function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-14 scroll-mt-24 border-t border-rule pt-10 font-headline text-3xl text-ink"
    >
      {children}
    </h2>
  )
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-6 font-body text-lg leading-relaxed text-ink-60">{children}</p>
}

/** Opening paragraph: same size, ink rather than ink-60, so the piece starts loud. */
export function Lede({ children }: { children: React.ReactNode }) {
  return <p className="mt-8 font-body text-xl leading-relaxed text-ink">{children}</p>
}

export function C({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[1px] bg-parchment-aged px-1 py-0.5 font-mono-grid text-[0.9em] text-ink">
      {children}
    </code>
  )
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith('http')
  const className = 'underline decoration-ink/40 underline-offset-4 hover:decoration-ink'
  if (external) {
    return (
      <a href={href} className={className} rel="noopener noreferrer" target="_blank">
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="mt-6 space-y-3 border-l border-rule pl-5 font-body text-lg leading-relaxed text-ink-60">
      {children}
    </ul>
  )
}

export function OL({ children }: { children: React.ReactNode }) {
  return (
    <ol className="mt-6 list-decimal space-y-3 pl-6 font-body text-lg leading-relaxed text-ink-60 marker:font-mono-grid marker:text-sm marker:text-ink">
      {children}
    </ol>
  )
}

/**
 * Code is presented as an exhibit rather than a snippet: a labelled block with
 * its source file named, because the point of every listing in these pieces is
 * that the reader can go and check it.
 */
export function Code({ label, children }: { label: string; children: string }) {
  return (
    // max-w-full plus overflow-hidden pins the figure to the column even though
    // its content is wider. Without both, a long SQL line pushed the whole
    // document past the viewport on a phone: the pre scrolled, but nothing was
    // stopping the figure itself from growing to fit it.
    <figure className="mt-8 max-w-full overflow-hidden border border-ink bg-parchment-card">
      <figcaption className="border-b border-dashed border-rule px-4 py-2 font-mono-grid text-[11px] uppercase tracking-[0.18em] text-ink-60">
        {label}
      </figcaption>
      <pre className="overflow-x-auto px-4 py-4">
        {/* Block with an intrinsic width, so the pre has something definite to
            scroll rather than an inline box that just spills. */}
        <code className="block w-max font-mono-grid text-[13px] leading-relaxed text-ink">
          {children}
        </code>
      </pre>
    </figure>
  )
}

export function Figure({
  src,
  alt,
  caption,
  width,
  height,
}: {
  src: string
  alt: string
  caption: string
  width: number
  height: number
}) {
  return (
    <figure className="mt-10">
      <div className="border border-ink">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="block h-auto w-full"
          sizes="(min-width: 768px) 48rem, 100vw"
        />
      </div>
      <figcaption className="mt-2 font-mono-grid text-[11px] uppercase tracking-[0.16em] text-ink-60">
        {caption}
      </figcaption>
    </figure>
  )
}

/** A stated limit or caveat, marked so it cannot be skimmed past. */
export function Aside({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-8 border-l-2 border-stamp-red bg-parchment-aged px-5 py-4 font-body text-base leading-relaxed text-ink">
      {children}
    </div>
  )
}
