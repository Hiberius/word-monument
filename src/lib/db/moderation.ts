import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { Cell } from '@/lib/types'

// Keyset pagination page size for the moderation queue. Small enough that a
// single admin session doesn't wait on a giant payload while still moving
// through a backlog quickly.
const QUEUE_PAGE_SIZE = 50

interface CellRow {
  id: number
  x: number
  y: number
  character: string | null
  status: Cell['status']
  reservation_id: string | null
  moderation_status: Cell['moderationStatus']
  purchased_at: string | null
}

function cellFromRow(row: CellRow): Cell {
  return {
    id: row.id,
    x: row.x,
    y: row.y,
    character: row.character,
    // The moderation queue never renders the grid, so the background color
    // isn't fetched here - it plays no role in review decisions.
    backgroundColor: null,
    status: row.status,
    reservationId: row.reservation_id,
    moderationStatus: row.moderation_status,
    purchasedAt: row.purchased_at,
  }
}

interface CellReportRow {
  id: number
  cell_id: number
  reason: string
  status: 'open' | 'dismissed'
  created_at: string
}

/**
 * Cells that need admin attention: anything already flagged, or anything
 * with at least one open (non-dismissed) report. Keyset-paginated by id
 * since the queue can grow large and offset pagination gets slow and
 * unstable under concurrent moderation actions.
 */
export async function listModerationQueue(
  cursor?: number
): Promise<{ items: Array<Cell & { reportReasons: string[] }>; nextCursor: number | null }> {
  const supabase = getSupabaseAdmin()

  let query = supabase
    .from('cells')
    .select('id, x, y, character, status, reservation_id, moderation_status, purchased_at, reported_count')
    .or('moderation_status.eq.flagged,reported_count.gt.0')
    .order('id', { ascending: true })
    .limit(QUEUE_PAGE_SIZE)

  if (cursor !== undefined) {
    query = query.gt('id', cursor)
  }

  const { data: cellRows, error: cellsError } = await query

  if (cellsError) {
    throw new Error(`listModerationQueue: cells query failed: ${cellsError.message}`)
  }

  const rows = (cellRows ?? []) as CellRow[]

  if (rows.length === 0) {
    return { items: [], nextCursor: null }
  }

  const cellIds = rows.map((row) => row.id)

  const { data: reportRows, error: reportsError } = await supabase
    .from('cell_reports')
    .select('id, cell_id, reason, status, created_at')
    .in('cell_id', cellIds)
    .eq('status', 'open')

  if (reportsError) {
    throw new Error(`listModerationQueue: cell_reports query failed: ${reportsError.message}`)
  }

  const reasonsByCellId = new Map<number, string[]>()
  for (const report of (reportRows ?? []) as CellReportRow[]) {
    const existing = reasonsByCellId.get(report.cell_id) ?? []
    existing.push(report.reason)
    reasonsByCellId.set(report.cell_id, existing)
  }

  const items = rows.map((row) => ({
    ...cellFromRow(row),
    reportReasons: reasonsByCellId.get(row.id) ?? [],
  }))

  const nextCursor = rows.length === QUEUE_PAGE_SIZE ? rows[rows.length - 1].id : null

  return { items, nextCursor }
}

/**
 * Full detail view for a single cell: the cell row itself, its complete
 * report history (open and dismissed, newest first), and any moderation
 * flags raised against it. Shaped loosely (not the shared `Cell` type)
 * because this is an admin-only debugging/decision view, not app state.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getCellDetail(cellId: number): Promise<any> {
  const supabase = getSupabaseAdmin()

  const { data: cellRow, error: cellError } = await supabase
    .from('cells')
    .select(
      'id, x, y, character, status, reservation_id, moderation_status, moderation_flags, moderation_checked_at, purchased_at, reported_count'
    )
    .eq('id', cellId)
    .maybeSingle()

  if (cellError) {
    throw new Error(`getCellDetail: cell query failed: ${cellError.message}`)
  }

  if (!cellRow) {
    return null
  }

  const { data: reportRows, error: reportsError } = await supabase
    .from('cell_reports')
    .select('id, cell_id, reason, status, created_at')
    .eq('cell_id', cellId)
    .order('created_at', { ascending: false })

  if (reportsError) {
    throw new Error(`getCellDetail: cell_reports query failed: ${reportsError.message}`)
  }

  // moderation_flags is a jsonb COLUMN on cells (the classifier category flags
  // written by the post-purchase check), not a table. Querying it as a table
  // made PostgREST return an unknown-relation error, so this admin view threw
  // a 500 on every cell instead of ever rendering.
  const flags = (cellRow as { moderation_flags?: unknown }).moderation_flags ?? null

  return {
    cell: cellFromRow(cellRow as CellRow),
    reports: reportRows ?? [],
    moderationFlags: flags,
    moderationCheckedAt: (cellRow as { moderation_checked_at?: string | null }).moderation_checked_at ?? null,
  }
}

/**
 * Removes a cell's published content via the atomic RPC (owned by the
 * DB-schema workstream): un-publishes the character, marks the cell
 * `removed`, and logs the moderation action server-side in one transaction
 * so a partial failure can't leave the grid and the audit log disagreeing.
 */
export async function removeCell(cellId: number, adminEmail: string, reason: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.rpc('remove_cell_atomic', {
    p_cell_id: cellId,
    p_admin_email: adminEmail,
    p_reason: reason,
  })

  if (error) {
    throw new Error(`removeCell: remove_cell_atomic RPC failed: ${error.message}`)
  }

  const row = Array.isArray(data) ? data[0] : data
  if (typeof row === 'boolean') return row
  if (row && typeof row === 'object' && 'success' in row) {
    return Boolean((row as { success?: boolean }).success)
  }
  return Boolean(row)
}

/**
 * Clears a flag without removing the cell's content (e.g. a report was
 * investigated and found to be unfounded). Logged distinctly from removal
 * so the audit trail can tell "reviewed, kept" apart from "reviewed, taken
 * down".
 */
export async function clearFlag(cellId: number, adminEmail: string, note: string): Promise<void> {
  const supabase = getSupabaseAdmin()

  const { error: updateError } = await supabase
    .from('cells')
    .update({ moderation_status: 'clear' })
    .eq('id', cellId)

  if (updateError) {
    throw new Error(`clearFlag: cells update failed: ${updateError.message}`)
  }

  // The column is `reason`, not `note` (see 0001_init_schema.sql). Inserting
  // `note` made PostgREST reject the row, so every Clear-flag click mutated the
  // cell and THEN threw, leaving the console 500-ing with no audit trail.
  const { error: logError } = await supabase.from('moderation_actions').insert({
    cell_id: cellId,
    admin_email: adminEmail,
    action: 'flag_cleared',
    reason: note,
  })

  if (logError) {
    throw new Error(`clearFlag: moderation_actions insert failed: ${logError.message}`)
  }
}

export async function dismissReport(reportId: number): Promise<void> {
  const supabase = getSupabaseAdmin()

  const { error } = await supabase.from('cell_reports').update({ status: 'dismissed' }).eq('id', reportId)

  if (error) {
    throw new Error(`dismissReport: cell_reports update failed: ${error.message}`)
  }
}
