import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getNote, listNotes, formatNoteDate } from '@/lib/notes'
import { SITE_NAME, SITE_URL, SITE_OG_IMAGE } from '@/lib/site'

interface Params {
  params: Promise<{ slug: string }>
}

// Notes never change after publication, so they are prerendered at build time
// and served as static HTML. Nothing on the page reads the database.
export function generateStaticParams() {
  return listNotes().map((note) => ({ slug: note.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const note = getNote(slug)
  if (!note) return {}

  const url = `${SITE_URL}/notes/${note.slug}`

  return {
    title: note.title,
    description: note.dek,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: note.title,
      description: note.dek,
      siteName: SITE_NAME,
      publishedTime: note.published,
      images: [SITE_OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: note.title,
      description: note.dek,
    },
  }
}

export default async function NotePage({ params }: Params) {
  const { slug } = await params
  const note = getNote(slug)
  if (!note) notFound()

  const { Body } = note

  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <script
        type="application/ld+json"
        // Static, author-controlled string built from the note register. No
        // user input reaches it.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: note.title,
            description: note.dek,
            datePublished: note.published,
            url: `${SITE_URL}/notes/${note.slug}`,
            publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
          }),
        }}
      />

      <Link
        href="/notes"
        className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60 underline decoration-ink/30 underline-offset-4 hover:text-ink"
      >
        Notes
      </Link>

      <h1 className="mt-4 font-headline text-4xl leading-tight text-ink sm:text-5xl">
        {note.title}
      </h1>

      <p className="mt-4 font-body text-lg leading-relaxed text-ink-60">{note.dek}</p>

      <p className="mt-6 border-t border-rule pt-4 font-mono-grid text-xs uppercase tracking-[0.16em] text-ink-60">
        {formatNoteDate(note.published)}
        <span aria-hidden="true" className="px-2">
          &middot;
        </span>
        {note.minutes} min read
      </p>

      <Body />

      <div className="mt-16 border-t-2 border-ink pt-8">
        <p className="font-headline text-2xl text-ink">
          The monument is open to walk, and not yet open to buy.
        </p>
        <p className="mt-3 font-body text-lg leading-relaxed text-ink-60">
          A million cells, one character each. You can pan the whole thing today, and leave an
          address if you want to be told when claiming switches on.
        </p>
        <Link
          href="/monument"
          className="mt-6 inline-block border-2 border-stamp-red bg-stamp-red px-5 py-3 font-body text-sm font-medium text-parchment transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
        >
          Walk the grid
        </Link>
      </div>
    </article>
  )
}
