import { CELL_PRICE_CENTS, RESERVATION_TTL_SECONDS } from '@/lib/config'
import { createCheckoutSession } from '@/lib/stripe/client'

export async function createCheckoutSessionForReservation(params: {
  reservationId: string
  cellCount: number
  successUrl: string
  cancelUrl: string
}): Promise<{ url: string; sessionId: string }> {
  const amountCents = params.cellCount * CELL_PRICE_CENTS

  // Anchored at session creation, on the same clock /api/checkout uses to
  // re-anchor reserved_until (extend_reservation) right before calling this.
  // The hold is deliberately given CHECKOUT_HOLD_SLACK_SECONDS more than this
  // window, so a payment completing in the session's last moments still finds
  // a live reservation. Do not stretch expires_at to match the hold: Stripe
  // rejects anything under a ~30 minute window, and this TTL already sits
  // close to that floor.
  const expiresAtUnixSeconds = Math.floor(Date.now() / 1000) + RESERVATION_TTL_SECONDS

  const cellWord = params.cellCount === 1 ? 'cell' : 'cells'
  const lineItemDescription = `Word Monument - ${params.cellCount} ${cellWord}`

  const session = await createCheckoutSession({
    lineItemDescription,
    amountCents,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    clientReferenceId: params.reservationId,
    reservationId: params.reservationId,
    expiresAtUnixSeconds,
  })

  return { url: session.url, sessionId: session.id }
}
