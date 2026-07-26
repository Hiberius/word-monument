import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/security/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

// `available` / `reserved` / `sold` come from cells.status; `flagged` /
// `removed` come from cells.moderation_status - two independent axes on the
// same row, both meaningful to an admin scanning grid health at a glance.
async function countWhere(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  column: 'status' | 'moderation_status',
  value: string
): Promise<number> {
  const { count, error } = await supabase
    .from('cells')
    .select('*', { count: 'exact', head: true })
    .eq(column, value)

  if (error) {
    throw new Error(`stats: count query failed for ${column}=${value}: ${error.message}`)
  }

  return count ?? 0
}

export async function GET(request: NextRequest) {
  const authorized = await requireAdmin(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const [available, reserved, sold, flagged, removed] = await Promise.all([
    countWhere(supabase, 'status', 'available'),
    countWhere(supabase, 'status', 'reserved'),
    countWhere(supabase, 'status', 'sold'),
    countWhere(supabase, 'moderation_status', 'flagged'),
    countWhere(supabase, 'moderation_status', 'removed'),
  ])

  return NextResponse.json({ available, reserved, sold, flagged, removed })
}
