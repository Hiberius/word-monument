import { CELL_PRICE_CENTS, RESERVATION_TTL_SECONDS } from '@/lib/config'
import { createCheckoutSession } from '@/lib/stripe/client'

export async function createCheckoutSessionForReservation(params: {
  reservationId: string
  cellCount: number
  successUrl: string
  cancelUrl: string
}): Promise<{ url: string; sessionId: string }> {
  const amountCents = params.cellCount * CELL_PRICE_CENTS

  // Same TTL as the DB hold, anchored at session creation. /api/checkout
  // re-anchors reserved_until to the same clock (extend_reservation) right
  // before calling this, so the session and the hold expire together instead
  // of the session outliving a hold that started earlier.
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
