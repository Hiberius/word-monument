export type CellStatus = 'available' | 'reserved' | 'sold'
export type ModerationStatus = 'clear' | 'flagged' | 'removed'

export interface Cell {
  id: number
  x: number
  y: number
  character: string | null
  backgroundColor: string | null
  status: CellStatus
  reservationId: string | null
  moderationStatus: ModerationStatus
  purchasedAt: string | null
}

export interface ReservationState {
  cells: Cell[]
  reservedUntil: string | null
  valid: boolean
}
