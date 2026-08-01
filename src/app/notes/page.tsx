import type { Metadata } from 'next'
import Link from 'next/link'
import { listNotes, formatNoteDate } from '@/lib/notes'
import { SITE_NAME, SITE_URL, SITE_OG_IMAGE } from '@/lib/site'

const description =
  'Writing that came out of building a million-cell grid: concurrency, payments, and what adversarial verification actually catches.'

export const metadata: Metadata = {
  title: 'Notes',
  description,
  alternates: { canonical: `${SITE_URL}/notes` },
  openGraph: {
    url: `${SITE_URL}/notes`,
    title: `Notes: ${SITE_NAME}`,
    description,
    siteName: SITE_NAME,
    images: [SITE_OG_IMAGE],
  },
}

export default function NotesIndexPage() {
  const notes = listNotes()

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
        Written while building
      </p>
      <h1 className="mt-3 font-headline text-4xl text-ink sm:text-5xl">Notes</h1>
      <p className="mt-6 font-body text-lg leading-relaxed text-ink-60">
        Long pieces about the parts that turned out to be hard. Mostly concurrency, payments, and
        what happens when you make one set of agents attack another set&rsquo;s work.
      </p>

      <ul className="mt-14 space-y-0">
        {notes.map((note) => (
          <li key={note.slug} className="border-t border-rule">
            <Link href={`/notes/${note.slug}`} className="group block py-8">
              <p className="font-mono-grid text-xs uppercase tracking-[0.16em] text-ink-60">
                {formatNoteDate(note.published)}
                <span aria-hidden="true" className="px-2">
                  &middot;
                </span>
                {note.minutes} min read
              </p>
              <h2 className="mt-2 font-headline text-3xl text-ink transition-colors group-hover:text-stamp-red">
                {note.title}
              </h2>
              <p className="mt-2 font-body text-lg leading-relaxed text-ink-60">{note.dek}</p>
              <span className="mt-3 inline-flex items-center gap-2 font-body text-sm font-medium text-ink transition-colors group-hover:text-stamp-red">
                Read it
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                  &rarr;
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
