'use client'

import { useState } from 'react'
import TurnstileWidget from '@/components/checkout/TurnstileWidget'
import ConfirmPayButton from '@/components/checkout/ConfirmPayButton'

interface CheckoutFormProps {
  reservationId: string
}

/** Thin client glue connecting the Turnstile token to the pay button - everything else on this page stays server-rendered. */
export default function CheckoutForm({ reservationId }: CheckoutFormProps) {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <TurnstileWidget onToken={setTurnstileToken} />
      <ConfirmPayButton reservationId={reservationId} turnstileToken={turnstileToken} />
    </div>
  )
}
