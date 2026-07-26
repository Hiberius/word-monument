import { getSupabasePublic, isSupabaseConfigured } from '@/lib/supabase/public'
import { GRID_SIZE, CELL_PRICE_CENTS } from '@/lib/config'
import { demoSoldCount, demoTotalRevenueCents } from '@/lib/monument/demoData'

const TOTAL_CELLS = GRID_SIZE * GRID_SIZE

export interface MonumentStats {
  totalCells: number
  cellsSold: number
  cellsReserved: number
  cellsRemaining: number
  totalRevenueCents: number
}

// monument_stats holds only sold_count/total_cents (see
// supabase/migrations/0001_init_schema.sql) - it's a denormalized counter
// bumped inside complete_purchase_atomic, not a general-purpose stats view.
// cellsReserved isn't stored anywhere; it's derived here. Read defensively so
// a schema drift degrades to zeros instead of taking the homepage down.
interface MonumentStatsRow {
  sold_count: number | null
  total_cents: number | null
}

const EMPTY_STATS: MonumentStats = {
  totalCells: TOTAL_CELLS,
  cellsSold: 0,
  cellsReserved: 0,
  cellsRemaining: TOTAL_CELLS,
  totalRevenueCents: 0,
}

function demoStats(): MonumentStats {
  const cellsSold = demoSoldCount()
  const totalRevenueCents = demoTotalRevenueCents()
  return {
    totalCells: TOTAL_CELLS,
    cellsSold,
    cellsReserved: 0,
    cellsRemaining: TOTAL_CELLS - cellsSold,
    totalRevenueCents,
  }
}

export async function getMonumentStats(): Promise<MonumentStats> {
  if (!isSupabaseConfigured()) {
    return demoStats()
  }

  try {
    const supabase = getSupabasePublic()
    const [{ data, error }, { count: reservedCount }] = await Promise.all([
      supabase.from('monument_stats').select('sold_count, total_cents').maybeSingle<MonumentStatsRow>(),
      supabase.from('cells_public').select('id', { count: 'exact', head: true }).eq('status', 'reserved'),
    ])

    // EMPTY_STATS is indistinguishable from a genuinely empty monument on the
    // homepage, and the page is cached for 60s, so a degraded read has to be
    // visible in the logs or nobody finds out it happened.
    if (error || !data) {
      console.error('[monumentStats] monument_stats read failed', error ?? 'no monument_stats row')
      return EMPTY_STATS
    }

    const cellsSold = data.sold_count ?? 0
    const cellsReserved = reservedCount ?? 0
    const totalRevenueCents = data.total_cents ?? cellsSold * CELL_PRICE_CENTS

    return {
      totalCells: TOTAL_CELLS,
      cellsSold,
      cellsReserved,
      cellsRemaining: Math.max(0, TOTAL_CELLS - cellsSold - cellsReserved),
      totalRevenueCents,
    }
  } catch (error) {
    console.error('[monumentStats] getMonumentStats failed', error)
    return EMPTY_STATS
  }
}
