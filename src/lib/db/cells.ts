import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { RESERVATION_TTL_SECONDS, MAX_CELLS_PER_TX, MAX_CONCURRENT_CELLS_PER_IP, CELL_PRICE_CENTS } from '@/lib/config'
import type { Cell, ReservationState } from '@/lib/types'

/**
 * All functions here call into Postgres RPCs owned by the DB-schema workstream.
 * RPC params follow the project-wide `p_` prefix convention; return shapes are
 * read defensively (single row object OR a one-element row array) since
 * postgrest's json encoding of a single-row SETOF function result can vary
 * by driver version.
 */
function firstRow<T>(data: unknown): T | undefined {
  if (Array.isArray(data)) {
    return data[0] as T | undefined
  }
  return (data ?? undefined) as T | undefined
}

/** The per-IP concurrent-hold cap fired: a deterministic policy rejection,
 *  not a server fault. Surfaced as its own type so the route can answer 429
 *  with a human explanation instead of a generic 500. */
export class ReserveCapExceededError extends Error {
  constructor() {
    super('per-ip concurrent reservation cap exceeded')
    this.name = 'ReserveCapExceededError'
  }
}

export async function reserveCells(params: {
  cellIds: number[]
  characters: string[]
  reservationId: string
  ipHash: string | null
  /** Per-cell background color hexes (null = default), aligned by index with cellIds. */
  backgroundColors: (string | null)[]
}): Promise<{ success: boolean; unavailableCellIds: number[] }> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.rpc('reserve_cells_atomic', {
    p_cell_ids: params.cellIds,
    p_characters: params.characters,
    p_reservation_id: params.reservationId,
    p_ip_hash: params.ipHash,
    p_background_colors: params.backgroundColors,
    // Explicit rather than relying on the RPC's own defaults, so app config
    // and DB behavior can never silently drift apart.
    p_ttl_seconds: RESERVATION_TTL_SECONDS,
    p_max_cells_per_tx: MAX_CELLS_PER_TX,
    p_max_concurrent_cells_per_ip: MAX_CONCURRENT_CELLS_PER_IP,
  })

  if (error) {
    if (error.message.includes('per-ip concurrent reservation cap exceeded')) {
      throw new ReserveCapExceededError()
    }
    throw new Error(`reserveCells: reserve_cells_atomic RPC failed: ${error.message}`)
  }

  const row = firstRow<{ success?: boolean; unavailable_cell_ids?: number[] }>(data)

  return {
    success: Boolean(row?.success),
    unavailableCellIds: row?.unavailable_cell_ids ?? [],
  }
}

export async function completePurchase(
  reservationId: string,
  stripeSessionId: string
): Promise<{
  success: boolean
  reason: 'processed' | 'already_sold' | 'reservation_not_found_or_conflict'
  cellIds: number[]
}> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.rpc('complete_purchase_atomic', {
    p_reservation_id: reservationId,
    p_stripe_session_id: stripeSessionId,
    // Explicit rather than relying on the RPC's own default, so the
    // publicly-displayed revenue total can never silently drift from the
    // app's actual per-cell price.
    p_cell_price_cents: CELL_PRICE_CENTS,
  })

  if (error) {
    throw new Error(`completePurchase: complete_purchase_atomic RPC failed: ${error.message}`)
  }

  const row = firstRow<{
    success?: boolean
    reason?: 'processed' | 'already_sold' | 'reservation_not_found_or_conflict'
    cell_ids?: number[]
  }>(data)

  return {
    success: Boolean(row?.success),
    reason: row?.reason ?? 'reservation_not_found_or_conflict',
    cellIds: row?.cell_ids ?? [],
  }
}

/**
 * Re-anchors a still-live hold to now + ttl. Called by /api/checkout right
 * before creating a Stripe session, whose expires_at is measured from session
 * creation: without this, a session opened late in the hold window would
 * outlive the hold. Returns how many cells were extended (0 = hold already
 * lapsed; the caller must treat the reservation as expired).
 */
export async function extendReservation(reservationId: string, ttlSeconds: number): Promise<number> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.rpc('extend_reservation', {
    p_reservation_id: reservationId,
    p_ttl_seconds: ttlSeconds,
  })

  if (error) {
    throw new Error(`extendReservation: extend_reservation RPC failed: ${error.message}`)
  }

  const row = firstRow<number>(data)
  return typeof row === 'number' ? row : Number(row ?? 0)
}

/**
 * Frees a reservation's cells. Pass the expiring Stripe session's expires_at
 * so a stale checkout.session.expired cannot release a hold that a newer,
 * still-payable session already extended (see migration 0011). Omit it to
 * release unconditionally.
 */
export async function releaseReservation(
  reservationId: string,
  sessionExpiresAt?: string | null
): Promise<number> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.rpc('release_reservation', {
    p_reservation_id: reservationId,
    p_session_expires_at: sessionExpiresAt ?? null,
  })

  if (error) {
    throw new Error(`releaseReservation: release_reservation RPC failed: ${error.message}`)
  }

  const row = firstRow<number>(data)
  return typeof row === 'number' ? row : Number(row ?? 0)
}

export async function getReservationCells(reservationId: string): Promise<ReservationState> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('cells')
    .select('id, x, y, character, background_color, status, reservation_id, moderation_status, purchased_at, reserved_until')
    .eq('reservation_id', reservationId)

  if (error) {
    throw new Error(`getReservationCells: query failed: ${error.message}`)
  }

  type CellRow = {
    id: number
    x: number
    y: number
    character: string | null
    background_color: string | null
    status: Cell['status']
    reservation_id: string | null
    moderation_status: Cell['moderationStatus']
    purchased_at: string | null
    reserved_until: string | null
  }

  const rows = (data ?? []) as CellRow[]
  const nowMs = Date.now()

  const cells: Cell[] = rows.map((row) => ({
    id: row.id,
    x: row.x,
    y: row.y,
    character: row.character,
    backgroundColor: row.background_color,
    status: row.status,
    reservationId: row.reservation_id,
    moderationStatus: row.moderation_status,
    purchasedAt: row.purchased_at,
  }))

  let reservedUntil: string | null = null
  let valid = false

  for (const row of rows) {
    if (row.status === 'reserved' && row.reserved_until) {
      reservedUntil = row.reserved_until
    }

    if (row.status === 'sold') {
      valid = true
    } else if (row.status === 'reserved' && row.reserved_until && new Date(row.reserved_until).getTime() > nowMs) {
      valid = true
    }
  }

  return {
    cells,
    reservedUntil,
    valid: rows.length > 0 && valid,
  }
}
