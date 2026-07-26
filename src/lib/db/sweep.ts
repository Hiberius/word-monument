import { createServiceRoleClient } from '@/lib/supabase/service-role'

// Cap per RPC call so a huge backlog can't hold a single request/invocation open indefinitely.
const SWEEP_BATCH_LIMIT = 5000

/**
 * Releases expired reservations back to `available`. Takes explicit credentials
 * (not process.env) because this also runs from the Cloudflare `scheduled()`
 * handler in custom-worker.ts, which only has `env.*` available.
 */
export async function sweepExpiredReservations(supabaseUrl: string, serviceRoleKey: string): Promise<number> {
  const supabase = createServiceRoleClient(supabaseUrl, serviceRoleKey)

  let total = 0

  for (;;) {
    const { data, error } = await supabase.rpc('sweep_expired_reservations', {
      p_batch_limit: SWEEP_BATCH_LIMIT,
    })

    if (error) {
      throw new Error(`sweepExpiredReservations: sweep_expired_reservations RPC failed: ${error.message}`)
    }

    const releasedRaw = Array.isArray(data) ? data[0] : data
    const released = typeof releasedRaw === 'number' ? releasedRaw : Number(releasedRaw ?? 0)

    total += released

    if (released <= 0) {
      break
    }
  }

  return total
}
