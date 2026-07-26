import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/security/admin-auth'
import { getHeroVariantStats } from '@/lib/db/heroVariants'
import { HERO_VARIANTS } from '@/lib/hero/variants'

// Joins the live per-variant counters with the variant copy from code so the
// admin sees which headline converts. Ordered by conversion rate desc so the
// current winner is on top.
export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stats = await getHeroVariantStats()
  const byId = new Map(stats.map((s) => [s.variant_id, s]))

  const variants = HERO_VARIANTS.map((v) => {
    const row = byId.get(v.id)
    const impressions = Number(row?.impressions ?? 0)
    const conversions = Number(row?.conversions ?? 0)
    return {
      id: v.id,
      headline: v.headline,
      weight: v.weight,
      impressions,
      conversions,
      cellsSold: Number(row?.cells_sold ?? 0),
      conversionRate: impressions > 0 ? conversions / impressions : 0,
    }
  }).sort((a, b) => b.conversionRate - a.conversionRate || b.conversions - a.conversions)

  return NextResponse.json({ variants })
}
