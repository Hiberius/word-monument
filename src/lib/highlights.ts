import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { groupCellsIntoWords, assembleMessage, letterCount } from '@/lib/wordGrouping'
import type { Cell } from '@/lib/types'

export interface Highlight {
  reservationId: string
  message: string
  x: number
  y: number
  updatedAt: string
}

const MIN_LETTERS = 5 // "exceeds roughly four characters"
const CANDIDATE_LIMIT = 500
const RESULT_LIMIT = 9

interface HighlightCellRow {
  id: number
  x: number
  y: number
  character: string | null
  status: string
  moderation_status: string | null
  reservation_id: string | null
  updated_at: string
}

/**
 * Server-only read for the homepage's Monument Highlights section. Pulls the
 * most recently sold, lettered cells and assembles them per reservation,
 * dropping any reservation that is a single character or that contains even
 * one cell with a non-clear moderation status. No client JS involved - this
 * runs entirely at render time on the server.
 *
 * Reads the `cells` base table through the service-role client, NOT the public
 * `cells_public` view: grouping needs reservation_id and the moderation filter
 * needs moderation_status, and both are deliberately withheld from the public
 * view. Selecting them from the view made PostgREST reject the query, so this
 * section silently rendered empty on every page load. Nothing private is
 * exposed by this: only the assembled message and its coordinates are
 * returned to the page.
 */
export async function getMonumentHighlights(): Promise<Highlight[]> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('cells')
      .select('id, x, y, character, status, moderation_status, reservation_id, updated_at')
      .eq('status', 'sold')
      .not('character', 'is', null)
      .not('reservation_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(CANDIDATE_LIMIT)

    if (error || !data) return []

    const byReservation = new Map<string, HighlightCellRow[]>()
    for (const row of data as HighlightCellRow[]) {
      if (!row.reservation_id) continue
      const bucket = byReservation.get(row.reservation_id) ?? []
      bucket.push(row)
      byReservation.set(row.reservation_id, bucket)
    }

    const highlights: Highlight[] = []

    for (const [reservationId, rows] of byReservation) {
      const clean = rows.every((row) => (row.moderation_status ?? 'clear') === 'clear')
      if (!clean) continue

      const cells: Cell[] = rows.map((row) => ({
        id: row.id,
        x: row.x,
        y: row.y,
        character: row.character,
        // Highlights render as assembled text, not colored cells.
        backgroundColor: null,
        status: 'sold',
        reservationId: row.reservation_id,
        moderationStatus: 'clear',
        purchasedAt: row.updated_at,
      }))

      const groups = groupCellsIntoWords(cells)
      if (letterCount(groups) <= MIN_LETTERS - 1) continue

      const message = assembleMessage(groups)
      const first = rows[0]
      const mostRecent = rows.reduce((latest, row) =>
        row.updated_at > latest.updated_at ? row : latest,
      )

      highlights.push({
        reservationId,
        message,
        x: first.x,
        y: first.y,
        updatedAt: mostRecent.updated_at,
      })
    }

    return highlights
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, RESULT_LIMIT)
  } catch {
    return []
  }
}
