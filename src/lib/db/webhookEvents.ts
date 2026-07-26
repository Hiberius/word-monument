import { getSupabaseAdmin } from '@/lib/supabase/admin'

/** A pending row older than this is a crashed prior attempt (the worker died
 *  between reserving the event and finishing/unreserving), not an in-flight
 *  one: webhook handling completes in seconds, not minutes. */
const STALE_PENDING_RECLAIM_MS = 5 * 60_000

/**
 * Idempotency ledger for Stripe webhook deliveries. Stripe may deliver the
 * same event more than once (retries, duplicate delivery) - this table lets
 * us claim an event exactly once before doing any side-effecting work.
 */
export async function reserveWebhookEvent(eventId: string, type: string): Promise<'reserved' | 'duplicate'> {
  const supabase = getSupabaseAdmin()

  // upsert + ignoreDuplicates issues INSERT ... ON CONFLICT (stripe_event_id) DO NOTHING,
  // and only returns a row when the insert actually happened.
  const { data, error } = await supabase
    .from('stripe_webhook_events')
    .upsert(
      { stripe_event_id: eventId, type, status: 'pending' },
      { onConflict: 'stripe_event_id', ignoreDuplicates: true }
    )
    .select('stripe_event_id')

  if (error) {
    throw new Error(`reserveWebhookEvent: upsert failed: ${error.message}`)
  }

  if ((data?.length ?? 0) > 0) {
    return 'reserved'
  }

  // The row already exists. If it's 'processed', this is a genuine duplicate.
  // But a row stuck in 'pending' means a prior attempt crashed BEFORE its
  // cleanup ran (isolate eviction, CPU-limit kill, deploy mid-request):
  // without reclaiming it, every Stripe retry would be answered 'duplicate'
  // and a PAID purchase would never be fulfilled. Claim it back by bumping
  // created_at conditionally; the .lt guard makes concurrent reclaims race
  // safely (only one updater matches the old timestamp).
  const staleBefore = new Date(Date.now() - STALE_PENDING_RECLAIM_MS).toISOString()
  const { data: reclaimed, error: reclaimError } = await supabase
    .from('stripe_webhook_events')
    .update({ created_at: new Date().toISOString() })
    .eq('stripe_event_id', eventId)
    .eq('status', 'pending')
    .lt('created_at', staleBefore)
    .select('stripe_event_id')

  if (reclaimError) {
    throw new Error(`reserveWebhookEvent: stale-pending reclaim failed: ${reclaimError.message}`)
  }

  return (reclaimed?.length ?? 0) > 0 ? 'reserved' : 'duplicate'
}

export async function markWebhookProcessed(eventId: string): Promise<void> {
  const supabase = getSupabaseAdmin()

  const { error } = await supabase
    .from('stripe_webhook_events')
    .update({ status: 'processed', processed_at: new Date().toISOString() })
    .eq('stripe_event_id', eventId)

  if (error) {
    throw new Error(`markWebhookProcessed: update failed: ${error.message}`)
  }
}

export async function unreserveWebhookEvent(eventId: string): Promise<void> {
  const supabase = getSupabaseAdmin()

  const { error } = await supabase
    .from('stripe_webhook_events')
    .delete()
    .eq('stripe_event_id', eventId)
    .eq('status', 'pending')

  if (error) {
    throw new Error(`unreserveWebhookEvent: delete failed: ${error.message}`)
  }
}
