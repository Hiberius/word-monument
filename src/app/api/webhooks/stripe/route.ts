import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { after } from 'next/server'
import { constructStripeEventAsync } from '@/lib/stripe/webhook'
import { createRefund } from '@/lib/stripe/client'
import { reserveWebhookEvent, markWebhookProcessed, unreserveWebhookEvent } from '@/lib/db/webhookEvents'
import { completePurchase, releaseReservation } from '@/lib/db/cells'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { postPurchaseModerationCheck } from '@/lib/moderation/pipeline'
import { recordHeroConversion } from '@/lib/db/heroVariants'
import { CELL_PRICE_CENTS, CHECKOUT_HOLD_SLACK_SECONDS } from '@/lib/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 512 * 1024

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCheckoutSessionCompleted(event: any): Promise<void> {
  const session = event.data.object
  const reservationId: string | null = session.client_reference_id ?? null
  const metadataReservationId: string | null = session.metadata?.reservation_id ?? null

  // Anti-tamper defense: client_reference_id and metadata.reservation_id are set
  // to the same value at session creation time - they must still agree here.
  if (!reservationId || reservationId !== metadataReservationId) {
    console.error(
      `Stripe webhook tamper check failed for session ${session.id}: ` +
        `client_reference_id=${reservationId} metadata.reservation_id=${metadataReservationId}`
    )
    return
  }

  // Defense-in-depth: createCheckoutSession restricts payment_method_types to
  // ['card'] specifically so completed always implies paid, but don't rely on
  // that config surviving every future edit - check explicitly. Delayed
  // payment methods fire this event with payment_status 'unpaid' while
  // settlement is still pending; treating that as a completed sale would
  // publish content before money actually moved, with no automatic reversal
  // if the payment later fails.
  if (session.payment_status !== 'paid') {
    console.error(
      `Stripe webhook: session ${session.id} completed with payment_status=${session.payment_status}, ` +
        `not treating reservation ${reservationId} as paid`
    )
    return
  }

  const result = await completePurchase(reservationId, session.id)

  if (result.reason === 'processed' || result.reason === 'already_sold') {
    // Paid-vs-delivered cross-check (defense in depth behind the RPC's
    // lapsed-hold guard): if the buyer was charged for more cells than were
    // actually marked sold, refund the difference and leave an audit trail.
    // Runs only on the FIRST completion; an already_sold replay delivers the
    // same set it did originally.
    if (result.reason === 'processed') {
      const paidCents: number | null = typeof session.amount_total === 'number' ? session.amount_total : null
      const deliveredCents = result.cellIds.length * CELL_PRICE_CENTS
      if (paidCents !== null && paidCents > deliveredCents) {
        const shortfallCents = paidCents - deliveredCents
        const paymentIntentId: string | null = session.payment_intent ?? null
        let partialRefund: { id: string; status: string } | null = null
        let partialRefundError: string | null = null
        if (paymentIntentId) {
          // Same rule as the conflict path: a failed refund must still leave an
          // audit row, otherwise the shortfall is invisible to the operator.
          try {
            partialRefund = await createRefund(paymentIntentId, shortfallCents)
          } catch (err) {
            partialRefundError = err instanceof Error ? err.message : String(err)
            console.error(`Stripe webhook: partial refund failed for session ${session.id}: ${partialRefundError}`)
          }
        } else {
          partialRefundError = 'no payment_intent on the session'
          console.error(`Stripe webhook: session ${session.id} delivered short with no payment_intent to refund`)
        }
        const supabaseAdmin = getSupabaseAdmin()
        const { error: anomalyError } = await supabaseAdmin.from('payment_anomalies').insert({
          stripe_session_id: session.id,
          reservation_id: reservationId,
          conflicted_cell_ids: result.cellIds,
          refund_id: partialRefund?.id ?? null,
          refund_status: partialRefund?.status ?? null,
          notes: partialRefundError
            ? `Paid ${paidCents} cents but only ${result.cellIds.length} cells delivered (${deliveredCents} cents). AUTOMATIC REFUND OF THE ${shortfallCents}-cent difference FAILED (${partialRefundError}) - refund this customer by hand.`
            : `Paid ${paidCents} cents but only ${result.cellIds.length} cells delivered (${deliveredCents} cents); refunded the ${shortfallCents}-cent difference.`,
        })
        if (anomalyError) {
          console.error(`Failed to record short-delivery anomaly for session ${session.id}: ${anomalyError.message}`)
        }
      }
    }

    revalidateTag('monument-stats')

    // Runs after the response is sent - can't block or affect the webhook's own 200.
    after(() => {
      postPurchaseModerationCheck(reservationId).catch((err: unknown) => {
        console.error(`postPurchaseModerationCheck failed for reservation ${reservationId}:`, err)
      })
    })

    // Credit the hero A/B variant only on the FIRST completion, never on an
    // idempotent 'already_sold' redelivery, so conversions can't double-count.
    if (result.reason === 'processed') {
      after(() => {
        recordHeroConversion(reservationId, result.cellIds.length).catch((err: unknown) => {
          console.error(`recordHeroConversion failed for reservation ${reservationId}:`, err)
        })
      })
    }

    return
  }

  // reason === 'reservation_not_found_or_conflict': the reservation was swept
  // before a slow payment landed. Auto-refund by default so a customer is
  // never left charged with nothing delivered.
  const paymentIntentId: string | null = session.payment_intent ?? null
  let refund: { id: string; status: string } | null = null
  let refundError: string | null = null

  if (paymentIntentId) {
    // The refund must never take the audit row down with it. A throw here used
    // to skip the payment_anomalies insert entirely, which is the worst
    // possible outcome: a customer charged, nothing delivered, and no record
    // for the operator to act on. Capture the failure and record it instead.
    try {
      refund = await createRefund(paymentIntentId)
    } catch (err) {
      refundError = err instanceof Error ? err.message : String(err)
      console.error(`Stripe webhook: refund failed for session ${session.id}: ${refundError}`)
    }
  } else {
    refundError = 'no payment_intent on the session'
    console.error(`Stripe webhook: session ${session.id} had no payment_intent to refund against conflict`)
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('payment_anomalies').insert({
    stripe_session_id: session.id,
    reservation_id: reservationId,
    conflicted_cell_ids: result.cellIds,
    refund_id: refund?.id ?? null,
    refund_status: refund?.status ?? null,
    notes: refundError
      ? `Reservation was swept or conflicted before payment completion. AUTOMATIC REFUND FAILED (${refundError}) - refund this customer by hand.`
      : 'Reservation was swept or conflicted before payment completion; auto-refunded.',
  })

  if (error) {
    throw new Error(`Failed to record payment anomaly for session ${session.id}: ${error.message}`)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCheckoutSessionExpired(event: any): Promise<void> {
  const session = event.data.object
  const reservationId: string | null = session.client_reference_id ?? null

  if (!reservationId) {
    console.error(`Stripe webhook: checkout.session.expired for session ${session.id} had no client_reference_id`)
    return
  }

  // Bound the release by THIS session's expiry. A reservation can have more
  // than one Stripe session (Back from the Stripe page, or a retry after a
  // lost response), and each new session extends reserved_until. Without the
  // bound, the older session's expiry event frees cells the newer, still
  // payable session is about to be charged for, leaving the buyer charged,
  // refunded and empty-handed.
  //
  // The bound is the session's expiry PLUS the slack the checkout route adds to
  // the hold: /api/checkout deliberately extends reserved_until past expires_at
  // so a payment landing in the last seconds is still fulfillable. Comparing
  // against the bare expires_at would therefore never match this session's own
  // hold, turning every expiry event into a no-op and leaving abandoned carts
  // to the 5-minute sweep. A NEWER session pushes reserved_until a further full
  // TTL out, well beyond this window, so the stale-session guard still holds.
  const expiresAt: number | null = typeof session.expires_at === 'number' ? session.expires_at : null
  const releaseBound = expiresAt
    ? new Date((expiresAt + CHECKOUT_HOLD_SLACK_SECONDS) * 1000).toISOString()
    : null
  await releaseReservation(reservationId, releaseBound)
}

export async function POST(request: Request) {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large.' }, { status: 413 })
    }
  }

  const signatureHeader = request.headers.get('stripe-signature') ?? ''
  const rawBody = await request.text()

  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('POST /api/webhooks/stripe: STRIPE_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any
  try {
    event = await constructStripeEventAsync(rawBody, signatureHeader, webhookSecret)
  } catch (err) {
    console.error('POST /api/webhooks/stripe: signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }

  const eventId: string = event.id
  const eventType: string = event.type

  const reservationStatus = await reserveWebhookEvent(eventId, eventType)
  if (reservationStatus === 'duplicate') {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  try {
    if (eventType === 'checkout.session.completed') {
      await handleCheckoutSessionCompleted(event)
    } else if (eventType === 'checkout.session.expired') {
      await handleCheckoutSessionExpired(event)
    }
    // Any other event type is intentionally ignored - still marked processed
    // below so Stripe does not keep retrying an event we'll never act on.

    await markWebhookProcessed(eventId)
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err) {
    // Unreserve so Stripe's retry starts clean instead of being stuck behind
    // a permanently-pending idempotency row.
    await unreserveWebhookEvent(eventId)
    console.error(`Stripe webhook handling failed for event ${eventId} (${eventType}):`, err)
    return NextResponse.json({ error: 'Webhook handling failed.' }, { status: 500 })
  }
}
