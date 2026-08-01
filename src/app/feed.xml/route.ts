import { listNotes } from '@/lib/notes'
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION } from '@/lib/site'

/**
 * RSS 2.0 for the notes.
 *
 * This is the one distribution channel that needs nobody's permission and no
 * account: aggregators, readers and newsletter curators poll it, and it keeps
 * working while nobody is posting anything. Hand-built because a feed is forty
 * lines of string, and a dependency to produce it would cost more than it saves.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char])
}

/** RSS wants RFC 822. Dates here are date-only, so noon UTC avoids a feed item
 *  appearing to publish a day early or late depending on the reader's zone. */
function rfc822(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toUTCString()
}

export const dynamic = 'force-static'

export function GET(): Response {
  const notes = listNotes()
  const latest = notes[0]

  const items = notes
    .map((note) => {
      const url = `${SITE_URL}/notes/${note.slug}`
      return `    <item>
      <title>${xmlEscape(note.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${xmlEscape(note.dek)}</description>
      <pubDate>${rfc822(note.published)}</pubDate>
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(SITE_NAME)}</title>
    <link>${SITE_URL}</link>
    <description>${xmlEscape(SITE_DESCRIPTION)}</description>
    <language>en</language>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />${
      latest ? `\n    <lastBuildDate>${rfc822(latest.published)}</lastBuildDate>` : ''
    }
${items}
  </channel>
</rss>
`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
