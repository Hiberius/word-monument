import Link from 'next/link'
import { getSupabasePublic, isSupabaseConfigured } from '@/lib/supabase/public'
import { PARCHMENT, INK, contrastGlyphColor } from '@/components/monument/canvas/palette'
import { GRID_SIZE } from '@/lib/config'
import { demoCellsInBounds } from '@/lib/monument/demoData'

// A wide (16:9-ish), server-rendered window onto the HEART of the monument,
// the center, where the founding inscription lives. Static SVG, no client JS, so
// the homepage keeps its budget. The whole thing links into the full explorer.

const COLS = 92
const ROWS = 34
const CENTER = Math.floor(GRID_SIZE / 2)
const MIN_X = CENTER - Math.floor(COLS / 2)
const MIN_Y = CENTER - Math.floor(ROWS / 2)
const MAX_X = MIN_X + COLS - 1
const MAX_Y = MIN_Y + ROWS - 1

const CELL = 15
const GAP = 1.5
const STEP = CELL + GAP
const GRIDLINE = 'rgba(26, 23, 16, 0.16)'

// PostgREST caps a single response at 1,000 rows. The preview frames the
// busiest part of the grid, so once the center fills in, an unpaged read would
// silently drop real inscriptions from the hero. PAGE_CAP is the whole box.
const PAGE_SIZE = 1000
const PAGE_CAP = Math.ceil((COLS * ROWS) / PAGE_SIZE)

interface PreviewCell {
  x: number
  y: number
  character: string | null
  status: string
  backgroundColor: string | null
}

async function getPreviewSlice(): Promise<PreviewCell[]> {
  if (!isSupabaseConfigured()) {
    return demoCellsInBounds(MIN_X, MIN_Y, MAX_X, MAX_Y).map((c) => ({
      x: c.x,
      y: c.y,
      character: c.character,
      status: c.status,
      backgroundColor: c.backgroundColor,
    }))
  }

  // This is a server component under the homepage's revalidate window, so the
  // read happens on the origin once a minute, not once per visitor. It stays a
  // direct Supabase query for that reason: routing it through /api/grid would
  // only add a Worker subrequest to every regeneration.
  try {
    const supabase = getSupabasePublic()
    const cells: PreviewCell[] = []

    for (let page = 0; page < PAGE_CAP; page++) {
      const from = page * PAGE_SIZE
      const { data, error } = await supabase
        .from('cells_public')
        .select('x, y, character, status, background_color')
        // Claimed cells only. The preview draws nothing for an available cell,
        // so including them would spend the whole row budget on blanks.
        .neq('status', 'available')
        .gte('x', MIN_X)
        .lte('x', MAX_X)
        .gte('y', MIN_Y)
        .lte('y', MAX_Y)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      if (error || !data) return []

      const rows = data as {
        x: number
        y: number
        character: string | null
        status: string
        background_color: string | null
      }[]

      for (const row of rows) {
        cells.push({
          x: row.x,
          y: row.y,
          character: row.character,
          status: row.status,
          backgroundColor: row.background_color,
        })
      }

      if (rows.length < PAGE_SIZE) break
    }

    return cells
  } catch {
    return []
  }
}

export default async function MonumentPreview() {
  const cells = await getPreviewSlice()

  const width = COLS * STEP
  const height = ROWS * STEP

  // Only claimed cells get their own SVG node. The empty grid behind them is a
  // single tiled <pattern>.
  //
  // This used to emit one <rect> per cell across the whole 92x34 window, which
  // is 3,128 elements, and it made the homepage document roughly a megabyte of
  // markup before any of it was even visible. That is the page a traffic spike
  // lands on first, and it was spending almost all of its weight drawing empty
  // squares. The pattern renders identically for a fraction of the bytes, and
  // the cost now scales with how much of the monument is actually claimed
  // rather than with the size of the window onto it.
  const nodes: React.ReactNode[] = []
  let soldCount = 0

  for (const cell of cells) {
    if (cell.status !== 'sold') continue

    const col = cell.x - MIN_X
    const row = cell.y - MIN_Y
    // getPreviewSlice already queries this box, but demo data and a future
    // change to the query are not obliged to respect it.
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue

    soldCount += 1

    const px = col * STEP
    const py = row * STEP
    const bg = cell.backgroundColor ?? INK

    // Opaque and unstroked, covering the patterned cell underneath exactly.
    nodes.push(
      <rect key={`${col}-${row}`} x={px} y={py} width={CELL} height={CELL} fill={bg} />,
    )

    if (cell.character) {
      nodes.push(
        <text
          key={`${col}-${row}-char`}
          x={px + CELL / 2}
          y={py + CELL / 2 + 3.5}
          textAnchor="middle"
          fontSize={9.5}
          fontFamily="var(--font-mono-grid, monospace)"
          fill={contrastGlyphColor(bg)}
        >
          {cell.character.toUpperCase()}
        </text>,
      )
    }
  }

  return (
    <section aria-label="Monument preview" className="border-b border-ink bg-parchment">
      <Link
        href="/monument"
        className="group relative block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stamp-red focus-visible:ring-inset"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          preserveAspectRatio="xMidYMid slice"
          role="img"
          aria-label="The heart of the monument, showing the founding inscription and nearby inscriptions. Select to explore the full grid."
          className="block h-[46vh] max-h-[560px] min-h-[280px] w-full transition-[filter] duration-300 group-hover:brightness-[0.97]"
        >
          <defs>
            {/* One tile, repeated by the renderer, in place of a rect per cell.
                The cell is inset by half the stroke width so its outline lands
                exactly on the 0..CELL box an unstroked sold cell paints over,
                and so the stroke is not clipped at the edge of the tile. */}
            <pattern
              id="monument-preview-grid"
              width={STEP}
              height={STEP}
              patternUnits="userSpaceOnUse"
            >
              <rect
                x={0.375}
                y={0.375}
                width={CELL - 0.75}
                height={CELL - 0.75}
                fill={PARCHMENT}
                stroke={GRIDLINE}
                strokeWidth={0.75}
              />
            </pattern>
          </defs>
          <rect x={0} y={0} width={width} height={height} fill={PARCHMENT} />
          <rect x={0} y={0} width={width} height={height} fill="url(#monument-preview-grid)" />
          {nodes}
        </svg>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 border-t border-ink bg-parchment px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="font-mono-grid text-xs uppercase tracking-[0.2em] text-ink-60">
            The heart of the monument &middot; {soldCount} claimed here &middot; {(GRID_SIZE * GRID_SIZE).toLocaleString('en-US')} cells in all
          </p>
          <span className="inline-flex items-center gap-2 font-body text-sm font-medium text-ink transition-colors group-hover:text-stamp-red">
            Walk the whole grid
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              &rarr;
            </span>
          </span>
        </div>
      </Link>
    </section>
  )
}
