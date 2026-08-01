import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getClientIp, hashIp } from '@/lib/security/rate-limit'
import { checkRateLimit } from '@/lib/security/rate-limit-kv'
import { readBoundedJson } from '@/lib/security/request-body'

// Launch notify list. The form only renders while the site is in preview
// (no Supabase connected), which is exactly why this stores into KV instead
// of Postgres: it must work in the one window where the database does not.
//
// Privacy contract, mirrored in /privacy: the KV entry is the address and a
// timestamp, nothing else. No IP, no hash, no user agent. The IP hash below
// is used only as a rate-limit key in the separate RATE_LIMIT namespace and
// is never written alongside the address.
//
// Reading the list back needs `wrangler kv key list --remote`; without the flag
// wrangler reads local dev storage and reports an empty list, which looks
// exactly like nobody having signed up. See docs/SETUP.md.

const RATE_LIMIT_MAX_REQUESTS = 5
const RATE_LIMIT_WINDOW_SECONDS = 600
const MAX_BODY_BYTES = 1024

// Pragmatic shape check, not RFC 5321 cosplay: something@something.tld with no
// whitespace. The length cap is the RFC's own ceiling for an address, and it is
// measured in BYTES below, not code units: the KV key limit is 512 UTF-8 bytes,
// so 171 three-byte characters passing a code-unit check would make the KV call
// itself throw and turn deliberately crafted garbage into a 500 where a 400
// belongs. Control characters are rejected outright: \s covers TAB/LF/CR but
// not the rest of C0 or DEL, and none of them belong in a deliverable address
// or in a KV key.
const MAX_EMAIL_BYTES = 254
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

interface WaitlistEnv {
  WAITLIST?: KVNamespace
  RATE_LIMIT?: KVNamespace
}

async function getBindings(): Promise<WaitlistEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return env as WaitlistEnv
  } catch {
    return {}
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const env = await getBindings()

    // The shared limiter fails OPEN by design, which is right for read paths
    // and wrong here: behind this route sits an unbounded permanent write, so
    // a deploy that loses the RATE_LIMIT binding must stop taking addresses
    // rather than silently taking them without any limit at all.
    if (!env.RATE_LIMIT || !env.WAITLIST) {
      return NextResponse.json(
        { ok: false, error: 'The list is not available right now. Please try again later.' },
        { status: 503 }
      )
    }

    const ipHash = await hashIp(getClientIp(request.headers))
    const allowed = await checkRateLimit(
      env.RATE_LIMIT,
      `rl:waitlist:${ipHash}`,
      RATE_LIMIT_MAX_REQUESTS,
      RATE_LIMIT_WINDOW_SECONDS
    )
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: 'Too many attempts. Try again in a few minutes.' },
        { status: 429 }
      )
    }

    const parsed = await readBoundedJson(request, MAX_BODY_BYTES)
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: 'Bad request.' }, { status: parsed.status })
    }

    const body = parsed.body as { email?: unknown; website?: unknown }

    // Honeypot: the form ships a visually hidden "website" field no human
    // sees. A filled value is a bot; answer success and store nothing, so the
    // bot learns nothing from the response shape.
    if (typeof body.website === 'string' && body.website.length > 0) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const raw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (
      raw.length === 0 ||
      new TextEncoder().encode(raw).length > MAX_EMAIL_BYTES ||
      CONTROL_CHARS.test(raw) ||
      !EMAIL_SHAPE.test(raw)
    ) {
      return NextResponse.json(
        { ok: false, error: 'That does not look like an email address.' },
        { status: 400 }
      )
    }

    const key = `email:${raw}`

    // First write wins so joinedAt keeps the original date. The read-then-put
    // pair is not atomic, but the race is a duplicate signup overwriting
    // itself with a timestamp milliseconds newer: harmless.
    const existing = await env.WAITLIST.get(key)
    if (existing === null) {
      await env.WAITLIST.put(key, JSON.stringify({ joinedAt: new Date().toISOString() }))
    }

    // Same response whether the address was new or already on the list.
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.warn('[api/waitlist] failed', err)
    return NextResponse.json(
      { ok: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
