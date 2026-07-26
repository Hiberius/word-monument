import { GRID_SIZE } from '@/lib/config'

/**
 * Parses a route [id] param as a cell id (0..GRID_SIZE*GRID_SIZE-1).
 * Number.isFinite alone (the previous check) accepts negatives, floats like
 * "1.5", and other non-plausible values that would only surface as an
 * unhandled Postgres "invalid input syntax" error several layers down.
 */
export function parseCellId(raw: string): number | null {
  const value = Number(raw)
  const maxCellId = GRID_SIZE * GRID_SIZE - 1
  if (!Number.isInteger(value) || value < 0 || value > maxCellId) {
    return null
  }
  return value
}

/** Parses a route [id] param as a generic non-negative integer row id. */
export function parsePositiveIntId(raw: string): number | null {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) {
    return null
  }
  return value
}
