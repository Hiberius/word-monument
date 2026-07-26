import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getClientIp, hashIp } from '@/lib/security/rate-limit'
import { checkRateLimit } from '@/lib/security/rate-limit-kv'
import { readBoundedJson } from '@/lib/security/request-body'
import { isKnownVariantId } from '@/lib/hero/variants'
import { recordHeroImpression } from '@/lib/db/heroVariants'

// Fire-and-forget beacon from the homepage: records that a hero copy variant
// was shown (once per session, guarded client-side). Low-stakes analytics -
// any failure returns a soft ok:false the client ignores, never a 500.

const RATE_LIMIT_MAX_REQUESTS = 20
const RATE_LIMIT_WINDOW_SECONDS = 60
const MAX_BODY_BYTES = 1024

async function getRateLimitKv(): Promise<KVNamespace | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return env.RATE_LIMIT
  } catch {
    return undefined
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ipHash = await hashIp(getClientIp(request.headers))
    const kv = await getRateLimitKv()
    const allowed = await checkRateLimit(kv, `rl:hero-impression:${ipHash}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS)
    if (!allowed) {
      return NextResponse.json({ ok: false }, { status: 429 })
    }

    const parsed = await readBoundedJson(request, MAX_BODY_BYTES)
    if (!parsed.ok) {
      return NextResponse.json({ ok: false }, { status: parsed.status })
    }

    const variantId = (parsed.body as { variantId?: unknown })?.variantId
    if (typeof variantId !== 'string' || !isKnownVariantId(variantId)) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    await recordHeroImpression(variantId)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.warn('[api/hero/impression] soft-failed', err)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
