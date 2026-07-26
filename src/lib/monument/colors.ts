// Curated background-color palette a buyer can choose for their inscription.
// Pure data + helpers, safe to import on both client and server. The reserve
// endpoint validates the chosen id against this list and stores the resolved
// hex on each cell, so only approved, on-brand colors ever reach the grid.
// The glyph color is derived from the background's luminance at render time,
// so only the background hex needs to be stored.

export interface CellColor {
  id: string
  label: string
  bg: string // hex, stored on the cell as background_color
}

export const CELL_COLORS: CellColor[] = [
  { id: 'ink', label: 'Ink', bg: '#1A1710' },
  { id: 'red', label: 'Red', bg: '#B23A2E' },
  { id: 'ochre', label: 'Ochre', bg: '#AD7C2E' },
  { id: 'olive', label: 'Olive', bg: '#5E6A49' },
  { id: 'teal', label: 'Teal', bg: '#3C5A57' },
  { id: 'slate', label: 'Slate', bg: '#3E4C59' },
  { id: 'plum', label: 'Plum', bg: '#5A3E52' },
  { id: 'paper', label: 'Paper', bg: '#E7DCC4' },
]

export const DEFAULT_CELL_COLOR_ID = 'ink'

export function getCellColorById(id: string | null | undefined): CellColor {
  return CELL_COLORS.find((c) => c.id === id) ?? CELL_COLORS[0]
}

export function isKnownColorId(id: string): boolean {
  return CELL_COLORS.some((c) => c.id === id)
}

/** Resolve a color id to its stored background hex (defaults to ink). */
export function bgHexForColorId(id: string | null | undefined): string {
  return getCellColorById(id).bg
}
