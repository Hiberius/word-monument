import type { ComponentType } from 'react'
import PointTheAgentsAtEachOther from '@/components/notes/PointTheAgentsAtEachOther'

/**
 * The writing that comes out of building this. Small on purpose: a register of
 * pieces, not a CMS. Adding one means adding a component and an entry here,
 * which keeps every note a typechecked artifact in the repo rather than a row
 * in a database that has to be running for the page to render.
 */
export interface Note {
  slug: string
  title: string
  /** One line under the title, and the meta description. */
  dek: string
  /** ISO date, used for the byline and the sitemap. */
  published: string
  /** Rounded reading time in minutes, stated so the length is not a surprise. */
  minutes: number
  Body: ComponentType
}

export const NOTES: readonly Note[] = [
  {
    slug: 'point-the-agents-at-each-other',
    title: 'Point the agents at each other',
    dek: 'A million-cell grid where every cell sells exactly once, built in six days, and the verification pattern that caught the AI’s own worst fix.',
    published: '2026-08-01',
    minutes: 12,
    Body: PointTheAgentsAtEachOther,
  },
]

export function getNote(slug: string): Note | undefined {
  return NOTES.find((note) => note.slug === slug)
}

/** Newest first. */
export function listNotes(): readonly Note[] {
  return [...NOTES].sort((a, b) => b.published.localeCompare(a.published))
}

export function formatNoteDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
