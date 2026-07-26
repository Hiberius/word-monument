'use client'

import { useEffect, useState } from 'react'
import {
  DEFAULT_HERO_VARIANT,
  getVariantById,
  pickWeightedVariant,
  type HeroVariant,
} from '@/lib/hero/variants'

const STORAGE_KEY = 'wm_hero_variant'
const IMPRESSION_FLAG = 'wm_hero_impression_sent'

/**
 * Returns the hero copy variant for this session. SSR and the first client
 * render both use DEFAULT_HERO_VARIANT so hydration matches; the session's
 * actually-assigned variant swaps in after mount (avoiding a hydration
 * mismatch). Assignment is stored in sessionStorage - no cookie - so it stays
 * stable across a refresh and travels (via getAssignedVariantId) to the
 * reservation for purchase attribution. Fires the impression beacon once per
 * session.
 */
export function useHeroVariant(): HeroVariant {
  const [variant, setVariant] = useState<HeroVariant>(DEFAULT_HERO_VARIANT)

  useEffect(() => {
    let assigned: HeroVariant
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) {
        assigned = getVariantById(stored)
      } else {
        assigned = pickWeightedVariant()
        sessionStorage.setItem(STORAGE_KEY, assigned.id)
      }
    } catch {
      // sessionStorage unavailable (private mode, etc.) - assign in-memory only.
      assigned = pickWeightedVariant()
    }

    setVariant(assigned)

    try {
      if (!sessionStorage.getItem(IMPRESSION_FLAG)) {
        sessionStorage.setItem(IMPRESSION_FLAG, '1')
        void fetch('/api/hero/impression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variantId: assigned.id }),
          keepalive: true,
        }).catch(() => {
          // Beacon is best-effort; a failure must never surface to the user.
        })
      }
    } catch {
      // No sessionStorage - skip the impression rather than risk double-counting.
    }
  }, [])

  return variant
}

/** The variant id assigned this session, for attaching to a reserve request. */
export function getAssignedVariantId(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}
