import { getSupabaseAdmin } from '@/lib/supabase/admin'

// All of these are fire-and-forget analytics writes. They must NEVER throw
// into their callers (the reserve route, the Stripe webhook) - a stats
// failure or an unconfigured Supabase must not break a reservation or a
// payment. Each swallows + logs.

export async function recordHeroImpression(variantId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.rpc('record_hero_impression', { p_variant_id: variantId })
    if (error) console.error('[db/heroVariants] record_hero_impression failed', error)
  } catch (err) {
    console.warn('[db/heroVariants] recordHeroImpression skipped', err)
  }
}

export async function storeReservationVariant(reservationId: string, variantId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.rpc('store_reservation_variant', {
      p_reservation_id: reservationId,
      p_variant_id: variantId,
    })
    if (error) console.error('[db/heroVariants] store_reservation_variant failed', error)
  } catch (err) {
    console.warn('[db/heroVariants] storeReservationVariant skipped', err)
  }
}

export async function recordHeroConversion(reservationId: string, cellCount: number): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.rpc('record_hero_conversion', {
      p_reservation_id: reservationId,
      p_cell_count: cellCount,
    })
    if (error) console.error('[db/heroVariants] record_hero_conversion failed', error)
  } catch (err) {
    console.warn('[db/heroVariants] recordHeroConversion skipped', err)
  }
}

export interface HeroVariantStatRow {
  variant_id: string
  impressions: number
  conversions: number
  cells_sold: number
}

export async function getHeroVariantStats(): Promise<HeroVariantStatRow[]> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('hero_variant_stats')
      .select('variant_id, impressions, conversions, cells_sold')
    if (error) {
      console.error('[db/heroVariants] getHeroVariantStats failed', error)
      return []
    }
    return (data ?? []) as HeroVariantStatRow[]
  } catch (err) {
    console.warn('[db/heroVariants] getHeroVariantStats skipped', err)
    return []
  }
}
