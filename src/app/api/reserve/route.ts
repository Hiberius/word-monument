import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { checkRateLimit } from '@/lib/security/rate-limit-kv'
import { getClientIp, hashIp } from '@/lib/security/rate-limit'
import { readBoundedJson } from '@/lib/security/request-body'
import { preReservationCheck, crossReservationBlocklistCheck } from '@/lib/moderation/pipeline'
import { reserveCells, ReserveCapExceededError } from '@/lib/db/cells'
import { storeReservationVariant } from '@/lib/db/heroVariants'
import { isKnownVariantId } from '@/lib/hero/variants'
import { isKnownColorId, bgHexForColorId } from '@/lib/monument/colors'
import { isSupabaseConfigured } from '@/lib/supabase/public'
import { isSupabaseAdminConfigured } from '@/lib/supabase/admin'
import { GRID_SIZE, MAX_CELLS_PER_TX } from '@/lib/config'

const RATE_LIMIT_MAX_REQUESTS = 10
const RATE_LIMIT_WINDOW_SECONDS = 60

// Generous headroom over MAX_CELLS_PER_TX (300) cells x ~60 bytes each as
// compact JSON - bounds memory/CPU spent parsing a body before any
// field-level validation gets a chance to reject it.
const MAX_BODY_BYTES = 32 * 1024

async function getRateLimitKv(): Promise<KVNamespace | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return env.RATE_LIMIT
  } catch (error) {
    console.warn('[api/reserve] Cloudflare context unavailable, skipping KV-backed rate limiting', error)
    return undefined
  }
}

interface ReserveRequestCell {
  x: number
  y: number
  character: string
}

interface ReserveRequestBody {
  cells: ReserveRequestCell[]
}

function isReserveRequestBody(body: unknown): body is ReserveRequestBody {
  if (!body || typeof body !== 'object') {
    return false
  }
  return Array.isArray((body as { cells?: unknown }).cells)
}

function isValidCellEntry(cell: unknown): cell is ReserveRequestCell {
  if (!cell || typeof cell !== 'object') {
    return false
  }
  const candidate = cell as { x?: unknown; y?: unknown; character?: unknown }
  return (
    typeof candidate.x === 'number' &&
    typeof candidate.y === 'number' &&
    Number.isInteger(candidate.x) &&
    Number.isInteger(candidate.y) &&
    candidate.x >= 0 &&
    candidate.x < GRID_SIZE &&
    candidate.y >= 0 &&
    candidate.y < GRID_SIZE &&
    typeof candidate.character === 'string'
  )
}

export async function POST(request: Request) {
  try {
    // (0) Live-preview short-circuit: with no Supabase project connected the
    // grid runs on demo content and can't take real reservations. Say so
    // plainly instead of failing with a generic 500 once reserveCells hits the
    // (absent) database. Gated on the SERVICE-ROLE credentials this path
    // actually needs, not on the public ones the read-only grid runs on.
    if (!isSupabaseAdminConfigured()) {
      // Public vars present but no service-role key is a broken deployment, not
      // a preview: a real buyer on a live site must not be told otherwise.
      if (isSupabaseConfigured()) {
        console.error(
          'POST /api/reserve: SUPABASE_SERVICE_ROLE_KEY is missing while the public Supabase vars are set - reservations are disabled'
        )
        return NextResponse.json(
          { error: 'Claiming words is temporarily unavailable. Please try again shortly.' },
          { status: 503 }
        )
      }

      return NextResponse.json(
        {
          error: 'preview',
          message:
            'This is a live preview - claiming words switches on once the monument’s backend is connected.',
        },
        { status: 503 }
      )
    }

    // (1) Rate limit - protects the reservation hold slots themselves from abuse.
    const clientIp = getClientIp(request.headers)
    const ipHash = await hashIp(clientIp)
    const rateLimitKey = `rl:reserve:${ipHash}`

    const rateLimitKv = await getRateLimitKv()
    const withinRateLimit = await checkRateLimit(rateLimitKv, rateLimitKey, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS)
    if (!withinRateLimit) {
      return NextResponse.json({ error: 'Too many requests, please slow down.' }, { status: 429 })
    }

    // (2) Bounded body read + shape validation.
    const parsed = await readBoundedJson(request, MAX_BODY_BYTES)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    }
    const body = parsed.body

    if (!isReserveRequestBody(body)) {
      return NextResponse.json({ error: 'Request body must include a cells array.' }, { status: 400 })
    }

    const { cells } = body

    if (cells.length < 1 || cells.length > MAX_CELLS_PER_TX) {
      return NextResponse.json(
        { error: `You must select between 1 and ${MAX_CELLS_PER_TX} cells.` },
        { status: 400 }
      )
    }

    const seenCoordinates = new Set<string>()
    for (const cell of cells) {
      if (!isValidCellEntry(cell)) {
        return NextResponse.json(
          { error: 'Each cell must have integer x/y coordinates in range and a character.' },
          { status: 400 }
        )
      }

      const key = `${cell.x},${cell.y}`
      if (seenCoordinates.has(key)) {
        return NextResponse.json({ error: 'Duplicate cell coordinates in request.' }, { status: 400 })
      }
      seenCoordinates.add(key)
    }

    // (3) Moderation runs BEFORE reserving - a reservation locks cells away from
    // real buyers for the full TTL, so garbage input must never burn a hold slot.
    // Pass full {x,y,character} cells (not a bare characters[]) so the blocklist
    // check joins them in grid reading order - the same order the live grid
    // renders in - rather than client-submission order, which an attacker could
    // shuffle to slip a blocked term past a naive array-order join.
    const moderationResult = preReservationCheck(cells)
    if (!moderationResult.ok) {
      return NextResponse.json(
        { error: moderationResult.reason ?? 'One or more characters were rejected by content moderation.' },
        { status: 422 }
      )
    }

    // Defense against splitting a blocked term across separate purchases: also
    // check the requested cells joined with already-sold horizontal neighbours.
    const crossResult = await crossReservationBlocklistCheck(cells)
    if (!crossResult.ok) {
      // The check fails closed, so its own outage lands here too. That is our
      // fault and it passes: answer it as a transient, retryable failure rather
      // than accusing the buyer's words of anything.
      if (crossResult.reason === 'moderation_unavailable') {
        return NextResponse.json(
          { error: 'Content checks are briefly unavailable. Please try again in a moment.' },
          { status: 503 }
        )
      }

      return NextResponse.json(
        { error: crossResult.reason ?? 'One or more characters were rejected by content moderation.' },
        { status: 422 }
      )
    }

    // (4) Reserve.
    const characters = cells.map((cell) => cell.character)
    const cellIds = cells.map((cell) => cell.y * GRID_SIZE + cell.x)
    const reservationId = crypto.randomUUID()

    // Per-cell background color: each cell sends its own color id; validate each
    // against the curated palette and resolve to the stored hex (null = default
    // ink). Validating server-side is what keeps arbitrary/garish colors out of
    // the grid. Aligned by index with cellIds/characters.
    const backgroundColors = cells.map((cell) => {
      const raw = (cell as { color?: unknown }).color
      return typeof raw === 'string' && isKnownColorId(raw) ? bgHexForColorId(raw) : null
    })

    // A cap rejection is a deterministic policy answer, not a server fault.
    // Deliberately NOT self-healed by releasing this IP's holds: reserved_by_ip_hash
    // is shared by everyone behind one NAT, CGNAT or VPN egress, so a release
    // scoped to it would let one visitor free a stranger's hold, including one
    // already committed to a live Stripe session.
    let result
    try {
      result = await reserveCells({
        cellIds,
        characters,
        reservationId,
        ipHash,
        backgroundColors,
      })
    } catch (err) {
      if (!(err instanceof ReserveCapExceededError)) {
        throw err
      }
      return NextResponse.json(
        {
          error:
            'You already have the maximum number of cells on hold from this connection. Complete that checkout or let it expire, then try again.',
        },
        { status: 429 }
      )
    }

    // (5) Respond.
    if (!result.success) {
      const unavailableCells = result.unavailableCellIds.map((id) => ({
        x: id % GRID_SIZE,
        y: Math.floor(id / GRID_SIZE),
      }))

      return NextResponse.json(
        {
          error: 'Some of the selected cells are no longer available.',
          unavailableCells,
        },
        { status: 409 }
      )
    }

    // Attribute this reservation to the homepage hero variant the buyer saw,
    // if the client passed a known one. Best-effort - never blocks the reserve.
    const heroVariant = (body as { heroVariant?: unknown }).heroVariant
    if (typeof heroVariant === 'string' && isKnownVariantId(heroVariant)) {
      await storeReservationVariant(reservationId, heroVariant)
    }

    return NextResponse.json({ reservationId }, { status: 200 })
  } catch (err) {
    console.error('POST /api/reserve failed:', err)
    return NextResponse.json({ error: 'Something went wrong, please try again.' }, { status: 500 })
  }
}
