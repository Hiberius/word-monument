import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Origin/Referer-based CSRF check for every non-GET/HEAD/OPTIONS request to
 * /api/* AND /admin/* (the whole cookie-authenticated moderation console -
 * previously excluded here because the matcher below only covered /api/*,
 * leaving every admin mutation route with no Origin verification at all).
 * Exact-path exemptions only (never prefix matches) for endpoints
 * authenticated by something other than the browser's cookie jar:
 * - /api/webhooks/stripe        (HMAC-authenticated by Stripe's signature)
 * - /api/cron/sweep             (shared-secret-authenticated, no cookies)
 * - /api/cron/moderation-sweep  (shared-secret-authenticated, no cookies)
 *
 * /admin/session (login) is deliberately NOT exempt: it's a real
 * browser-originated POST with a real Origin header, so there's no reason
 * to skip the check just because no session cookie exists yet.
 */
const EXEMPT_PATHS: ReadonlySet<string> = new Set([
  '/api/webhooks/stripe',
  '/api/cron/sweep',
  '/api/cron/moderation-sweep',
]);

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

function extractHost(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (EXEMPT_PATHS.has(pathname) || SAFE_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  const requestOriginHost =
    extractHost(request.headers.get('origin')) ?? extractHost(request.headers.get('referer'));

  // Compare against the request's OWN Host, not a pinned env var. Host-based
  // comparison is the correct same-origin CSRF check: a cross-site attacker
  // cannot forge the victim browser's Origin, so Origin: evil.com against
  // Host: <site> still mismatches and is blocked. Pinning to
  // NEXT_PUBLIC_SITE_URL instead made every hostname except that exact one
  // reject 100% of POSTs, which silently breaks reserve and checkout whenever
  // the served host differs from the configured one: a workers.dev preview, a
  // staging host, or simply a visitor arriving on www when the var holds the
  // apex. NEXT_PUBLIC_SITE_URL is still accepted so a same-site request from
  // the canonical host passes even behind a proxy that rewrites Host.
  const requestHost = request.headers.get('host');
  const configuredHost = extractHost(process.env.NEXT_PUBLIC_SITE_URL);

  const isSameOrigin =
    requestOriginHost !== null &&
    (requestOriginHost === requestHost || requestOriginHost === configuredHost);

  // Fail CLOSED unconditionally - not gated on NODE_ENV. A single ambient
  // env-var check with no independent fallback would silently disable this
  // guard for every state-changing route the moment anything (an alternate
  // build path, a misconfigured preview Worker) fails to inline NODE_ENV as
  // "production". The local-dev fallback above already makes this check
  // pass naturally under `next dev` (Origin matches the request's own Host),
  // so there's no need to gate enforcement on environment at all.
  if (!isSameOrigin) {
    return new NextResponse('Forbidden: origin verification failed', { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*'],
};
