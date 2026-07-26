import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getReservationCells } from '@/lib/db/cells'
import { getClientIp, hashIp } from '@/lib/security/rate-limit'
import { checkRateLimit } from '@/lib/security/rate-limit-kv'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RATE_LIMIT_MAX_REQUESTS = 30
const RATE_LIMIT_WINDOW_SECONDS = 60

async function getRateLimitKv(): Promise<KVNamespace | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return env.RATE_LIMIT
  } catch {
    return undefined
  }
}

// Unauthenticated read used by /success and /checkout (which have no session).
// UUIDs are unguessable, but the id is validated as a real UUID (rejecting
// malformed input outright) and reads are per-IP rate-limited to bound
// enumeration attempts.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid reservation id.' }, { status: 400 })
  }

  try {
    try {
      const ipHash = await hashIp(getClientIp(request.headers))
      const kv = await getRateLimitKv()
      const allowed = await checkRateLimit(
        kv,
        `rl:reservation-get:${ipHash}`,
        RATE_LIMIT_MAX_REQUESTS,
        RATE_LIMIT_WINDOW_SECONDS,
      )
      if (!allowed) {
        return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
      }
    } catch {
      // Rate limiter unavailable (e.g. no IP hash secret locally) - proceed
      // rather than block the read the success page depends on.
    }

    const reservation = await getReservationCells(id)
    return NextResponse.json(reservation)
  } catch (error) {
    console.error('GET /api/reservation/[id] failed', error)
    return NextResponse.json({ error: 'Could not load this reservation.' }, { status: 500 })
  }
}
