'use client'

import { useEffect } from 'react'
import { selectionStore } from '@/lib/monument/selection-store'

/**
 * Empties the in-progress cart once the purchase it represents has completed.
 *
 * The cart lives in sessionStorage and nothing used to clear it, so after a
 * successful checkout the same cells stayed selected: going back to /monument
 * showed the buyer their now-sold cells still sitting in the tray, and pressing
 * Review & Checkout again reserved nothing and returned a 409 listing the
 * buyer's own cells as unavailable. Rendered on /success, which is only
 * reachable after Stripe redirects back from a completed session.
 */
export default function ClearCartOnMount() {
  useEffect(() => {
    selectionStore.clear()
  }, [])

  return null
}
