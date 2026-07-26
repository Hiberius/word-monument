import { GRID_SIZE, TILE_SIZE, CELL_PRICE_CENTS } from '@/lib/config'
import { bgHexForColorId } from '@/lib/monument/colors'
import type { CellStatus } from '@/lib/types'

/**
 * Local-only stand-in content, used ONLY when isSupabaseConfigured() is false
 * (no live Supabase project connected yet - see @/lib/supabase/public). Lets
 * the grid explorer, homepage banner, and live counters show something
 * coherent and testable before real credentials exist. Production always has
 * a real Supabase project, so this module never runs there.
 *
 * The centerpiece is the monument's founding inscription, placed at the
 * heart of the grid (~cell 500,500), with a handful of early inscriptions
 * around it in different background colors to show the grid alive.
 */

const CENTER = Math.floor(GRID_SIZE / 2)

interface DemoWord {
  x: number
  y: number
  text: string
  /** Background color id (see @/lib/monument/colors); undefined = default ink. */
  colorId?: string
}

/** A word horizontally centered on the grid's center column. */
function centered(text: string, y: number, colorId?: string): DemoWord {
  return { x: CENTER - Math.floor(text.length / 2), y, text, colorId }
}

const DEMO_WORDS: DemoWord[] = [
  // The founding inscription, centered on the monument's heart.
  centered('THE INTERNET FORGETS', CENTER - 2, 'ink'),
  centered('THIS DOES NOT', CENTER, 'red'),
  centered('SAY IT WHERE IT STAYS', CENTER + 2, 'ink'),
  // Early inscriptions around it - grid alive + color variety.
  { x: CENTER - 30, y: CENTER - 10, text: 'REMEMBER', colorId: 'ochre' },
  { x: CENTER + 16, y: CENTER - 8, text: 'SPEAK', colorId: 'teal' },
  { x: CENTER - 26, y: CENTER + 8, text: 'STILL HERE', colorId: 'slate' },
  { x: CENTER + 12, y: CENTER + 10, text: 'FREE', colorId: 'plum' },
]

export interface DemoCell {
  x: number
  y: number
  status: CellStatus
  character: string | null
  backgroundColor: string | null
}

function cellFromWord(x: number, y: number): DemoCell | null {
  for (const word of DEMO_WORDS) {
    if (y !== word.y || x < word.x || x >= word.x + word.text.length) continue
    const char = word.text[x - word.x]
    if (char === ' ') return { x, y, status: 'available', character: null, backgroundColor: null }
    return { x, y, status: 'sold', character: char, backgroundColor: bgHexForColorId(word.colorId) }
  }
  return null
}

/** Every sold demo cell within an inclusive bounding box, clamped to the grid. */
export function demoCellsInBounds(minX: number, minY: number, maxX: number, maxY: number): DemoCell[] {
  const x0 = Math.max(0, Math.floor(minX))
  const y0 = Math.max(0, Math.floor(minY))
  const x1 = Math.min(GRID_SIZE - 1, Math.ceil(maxX))
  const y1 = Math.min(GRID_SIZE - 1, Math.ceil(maxY))

  const cells: DemoCell[] = []
  // Only scan the rows the demo words occupy, not the whole bounding box.
  const relevantYs = new Set(DEMO_WORDS.map((w) => w.y))
  for (const y of relevantYs) {
    if (y < y0 || y > y1) continue
    for (let x = x0; x <= x1; x++) {
      const cell = cellFromWord(x, y)
      if (cell && cell.status === 'sold') cells.push(cell)
    }
  }
  return cells
}

/** Per-tile sold counts across the whole grid, for the Tier 0/1 density view. */
export function demoTileSummaries(): { tile_x: number; tile_y: number; sold_count: number }[] {
  const tilesPerRow = GRID_SIZE / TILE_SIZE
  const summaries: { tile_x: number; tile_y: number; sold_count: number }[] = []

  for (let ty = 0; ty < tilesPerRow; ty++) {
    for (let tx = 0; tx < tilesPerRow; tx++) {
      let soldCount = 0
      for (const word of DEMO_WORDS) {
        if (Math.floor(word.x / TILE_SIZE) === tx && Math.floor(word.y / TILE_SIZE) === ty) {
          soldCount += word.text.replace(/ /g, '').length
        }
      }
      summaries.push({ tile_x: tx, tile_y: ty, sold_count: soldCount })
    }
  }
  return summaries
}

/** Total sold cells across all demo words - backs the demo live-counter fallback. */
export function demoSoldCount(): number {
  return DEMO_WORDS.reduce((sum, word) => sum + word.text.replace(/ /g, '').length, 0)
}

export function demoTotalRevenueCents(): number {
  return demoSoldCount() * CELL_PRICE_CENTS
}

/**
 * A representative purchased entry, used ONLY to render the dynamic share card
 * locally when no live Supabase project is connected (so the card preview shows
 * a real message + color instead of the generic fallback). A real reservation
 * carries one chosen background color across its whole inscription, so this
 * mirrors that shape: one message, one color, and its starting coordinate.
 */
export function demoShareEntry(): {
  message: string
  cellCount: number
  backgroundColor: string
  startX: number
  startY: number
} {
  const message = 'STILL HERE'
  return {
    message,
    cellCount: message.replace(/ /g, '').length,
    backgroundColor: bgHexForColorId('teal'),
    startX: CENTER - Math.floor(message.length / 2),
    startY: CENTER,
  }
}
