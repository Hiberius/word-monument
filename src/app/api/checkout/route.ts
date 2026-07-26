import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { checkRateLimit } from '@/lib/security/rate-limit-kv'
import { getClientIp, hashIp } from '@/lib/security/rate-limit'
import { readBoundedJson } from '@/lib/security/request-body'
import { verifyTurnstileToken } from '@/lib/security/turnstile'
import { getReservationCells, extendReservation } from '@/lib/db/cells'
import { createCheckoutSessionForReservation } from '@/lib/stripe/checkout'
import { RESERVATION_TTL_SECONDS } from '@/lib/config'

const RATE_LIMIT_MAX_REQUESTS = 10
const RATE_LIMIT_WINDOW_SECONDS = 60

// A reservationId (uuid) plus a Turnstile token comfortably fits in a few KB.
const MAX_BODY_BYTES = 8 * 1024

// Separate, tighter, per-reservation limit on top of the per-IP one above -
// bounds how many Stripe Checkout Sessions can be created for the SAME
// reservation, independent of which IP is asking. Without this, a KV outage
// (which makes the per-IP limit above fail open) would leave Stripe session
// creation completely unthrottled.
const PER_RESERVATION_RATE_LIMIT_MAX_REQUESTS = 3
const PER_RESERVATION_RATE_LIMIT_WINDOW_SECONDS = 5 * 60

async function getRateLimitKv(): Promise<KVNamespace | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return env.RATE_LIMIT
  } catch (error) {
    console.warn('[api/checkout] Cloudflare context unavailable, skipping KV-backed rate limiting', error)
    return undefined
  }
}

interface CheckoutRequestBody {
  reservationId: string
  turnstileToken: string
}

function isCheckoutRequestBody(body: unknown): body is CheckoutRequestBody {
  if (!body || typeof body !== 'object') {
    return false
  }
  const candidate = body as { reservationId?: unknown; turnstileToken?: unknown }
  return (
    typeof candidate.reservationId === 'string' &&
    candidate.reservationId.length > 0 &&
    typeof candidate.turnstileToken === 'string' &&
    candidate.turnstileToken.length > 0
  )
}

export async function POST(request: Request) {
  try {
    // (1) Rate limit.
    const clientIp = getClientIp(request.headers)
    const ipHash = await hashIp(clientIp)
    const rateLimitKey = `rl:checkout:${ipHash}`

    const rateLimitKv = await getRateLimitKv()
    const withinRateLimit = await checkRateLimit(rateLimitKv, rateLimitKey, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS)
    if (!withinRateLimit) {
      return NextResponse.json({ error: 'Too many requests, please slow down.' }, { status: 429 })
    }

    const parsed = await readBoundedJson(request, MAX_BODY_BYTES)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    }
    const body = parsed.body

    if (!isCheckoutRequestBody(body)) {
      return NextResponse.json({ error: 'Request body must include reservationId and turnstileToken.' }, { status: 400 })
    }

    const { reservationId, turnstileToken } = body

    // (1b) Per-reservation rate limit, independent of IP - bounds how many
    // Stripe sessions get created for the same reservation even if the
    // per-IP limit above fails open on a KV outage.
    const withinPerReservationLimit = await checkRateLimit(
      rateLimitKv,
      `rl:checkout-session:${reservationId}`,
      PER_RESERVATION_RATE_LIMIT_MAX_REQUESTS,
      PER_RESERVATION_RATE_LIMIT_WINDOW_SECONDS
    )
    if (!withinPerReservationLimit) {
      return NextResponse.json({ error: 'Too many requests for this reservation, please slow down.' }, { status: 429 })
    }

    // (2) Turnstile verification.
    const turnstileValid = await verifyTurnstileToken(turnstileToken, clientIp)
    if (!turnstileValid) {
      return NextResponse.json({ error: 'Verification failed, please try again.' }, { status: 400 })
    }

    // (3) Reservation must be PAYABLE, which is stricter than the success
    // page's "valid": every cell still reserved (none sold - a sold cell means
    // this reservation was already completed, and minting a new session for it
    // would double-charge the buyer into an auto-refund) and the hold not yet
    // lapsed.
    const reservation = await getReservationCells(reservationId)
    const nowMs = Date.now()
    const payable =
      reservation.cells.length > 0 &&
      reservation.cells.every((cell) => cell.status === 'reserved') &&
      reservation.reservedUntil !== null &&
      new Date(reservation.reservedUntil).getTime() > nowMs
    if (!payable) {
      return NextResponse.json({ error: 'This reservation has expired or is no longer valid.' }, { status: 410 })
    }

    // (3b) Re-anchor the hold to now + TTL so it covers the whole life of the
    // Stripe session we are about to create (whose expires_at is measured from
    // session creation, not from when the cells were first reserved). If the
    // hold lapsed in the meantime, treat the reservation as expired.
    const extendedCount = await extendReservation(reservationId, RESERVATION_TTL_SECONDS)
    if (extendedCount !== reservation.cells.length) {
      return NextResponse.json({ error: 'This reservation has expired or is no longer valid.' }, { status: 410 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    if (!siteUrl) {
      console.error('POST /api/checkout: NEXT_PUBLIC_SITE_URL is not configured')
      return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 })
    }

    // Param name MUST be reservationId - the /success and /checkout pages read
    // searchParams.reservationId. A mismatch here shows a paying customer
    // "order not found" even though the webhook completed the purchase.
    const successUrl = `${siteUrl}/success?reservationId=${encodeURIComponent(reservationId)}`
    const cancelUrl = `${siteUrl}/checkout?reservationId=${encodeURIComponent(reservationId)}`

    // (4) Create the Stripe Checkout Session.
    const session = await createCheckoutSessionForReservation({
      reservationId,
      cellCount: reservation.cells.length,
      successUrl,
      cancelUrl,
    })

    // (5) Respond.
    return NextResponse.json({ checkoutUrl: session.url }, { status: 200 })
  } catch (err) {
    console.error('POST /api/checkout failed:', err)
    return NextResponse.json({ error: 'Something went wrong, please try again.' }, { status: 500 })
  }
}
