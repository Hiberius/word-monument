import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import {
  verifyAdminPassword,
  createAdminSessionCookieValue,
  ADMIN_SESSION_COOKIE_NAME,
} from '@/lib/security/admin-auth'
import { checkRateLimit } from '@/lib/security/rate-limit-kv'
import { getClientIp, hashIp } from '@/lib/security/rate-limit'
import { recordAdminLoginAttempt } from '@/lib/db/adminLoginLockout'
import { ADMIN_SESSION_MAX_AGE_SECONDS, ADMIN_LOGIN_RATE_LIMIT_MAX_REQUESTS, ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS } from '@/lib/admin/constants'

// Handles admin login submissions.
//
// This intentionally does NOT live at `/admin/login` even though that's the
// login page's URL: the App Router forbids a route.ts and a page.tsx from
// resolving to the same path (confirmed via `next build`, which fails with
// "You cannot have two parallel pages that resolve to the same path" for
// exactly this collision). The login page posts here instead.
//
// This route is also deliberately NOT under `src/app/admin/api/*` and does
// NOT call requireAdmin - it's the mechanism for obtaining the admin
// session in the first place, so gating it behind requireAdmin would make
// login impossible.
async function getRateLimitKv(): Promise<KVNamespace | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return env.RATE_LIMIT
  } catch (error) {
    console.warn('[admin/session] Cloudflare context unavailable, skipping KV-backed rate limiting', error)
    return undefined
  }
}

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request.headers)
    const ipHash = await hashIp(clientIp)
    const rateLimitKey = `rl:admin-login:${ipHash}`

    // Cheap first gate. Fails open on a KV outage - the DB-backed lockout
    // below is what actually holds the line in that case, since it's
    // atomic (Postgres row locking) and doesn't depend on KV at all.
    const rateLimitKv = await getRateLimitKv()
    const withinRateLimit = await checkRateLimit(
      rateLimitKv,
      rateLimitKey,
      ADMIN_LOGIN_RATE_LIMIT_MAX_REQUESTS,
      ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS
    )

    if (!withinRateLimit) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const password = (body as { password?: unknown } | null)?.password

    if (typeof password !== 'string' || password.length === 0) {
      return NextResponse.json({ error: 'Password is required.' }, { status: 400 })
    }

    const valid = await verifyAdminPassword(password)

    // Always record the attempt through the DB backstop, even a correct
    // password - if a prior burst from THIS client already tripped the
    // per-IP lockout, this rejects the login regardless of whether the
    // password submitted just now is right, which is the point of a lockout.
    const lockout = await recordAdminLoginAttempt(ipHash, valid)

    if (!lockout.allowed) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Try again later.', lockedUntil: lockout.lockedUntil },
        { status: 429 }
      )
    }

    if (!valid) {
      return NextResponse.json({ error: 'Invalid password.' }, { status: 401 })
    }

    const sessionValue = await createAdminSessionCookieValue()

    const response = NextResponse.json({ success: true }, { status: 200 })
    response.cookies.set({
      name: ADMIN_SESSION_COOKIE_NAME,
      value: sessionValue,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/admin',
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    })

    return response
  } catch (err) {
    console.error('POST /admin/session failed:', err)
    return NextResponse.json({ error: 'Something went wrong, please try again.' }, { status: 500 })
  }
}

// Logout: clears the session cookie. There is no server-side revocation
// list (sessions are stateless signed tokens), so this only ends the
// session for whoever's browser calls it - it cannot invalidate a copy of
// the cookie that leaked elsewhere. Rotating ADMIN_SESSION_SECRET remains
// the only way to invalidate every outstanding session at once.
export async function DELETE() {
  const response = NextResponse.json({ success: true }, { status: 200 })
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/admin',
    maxAge: 0,
  })
  return response
}
