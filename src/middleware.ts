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

/**
 * The scheme-and-host of a URL, or null when it is not one.
 *
 * Deliberately `.origin` and not `.host`: dropping the scheme made
 * `http://<site>` compare equal to `https://<site>`, so a page served to the
 * victim over cleartext could post to the real origin and pass the check. That
 * was reachable in production while port 80 answered.
 */
function extractOrigin(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (EXEMPT_PATHS.has(pathname) || SAFE_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  const requestOrigin =
    extractOrigin(request.headers.get('origin')) ?? extractOrigin(request.headers.get('referer'));

  // Compare against the request's OWN host, not a pinned env var: a
  // cross-site attacker cannot forge the victim browser's Origin, so
  // Origin: evil.com against Host: <site> still mismatches and is blocked.
  // Pinning to NEXT_PUBLIC_SITE_URL instead made every hostname except that
  // exact one reject 100% of POSTs, which silently breaks reserve and checkout
  // whenever the served host differs from the configured one: a preview
  // Worker, a staging host, or a visitor arriving on www when the var holds
  // the apex. NEXT_PUBLIC_SITE_URL is still accepted so a same-site request
  // from the canonical host passes even behind a proxy that rewrites Host.
  //
  // The request's own origin is reconstructed as https + Host rather than read
  // from nextUrl: behind Cloudflare the inbound URL's scheme is not a reliable
  // statement about what the browser used, and every host this app is reached
  // on is TLS-terminated (custom-worker.ts upgrades cleartext before Next ever
  // sees it). Local dev over http is handled by the explicit exception below,
  // which is scoped to loopback so it cannot widen anything in production.
  const requestHost = request.headers.get('host');
  const requestOwnOrigin = requestHost ? `https://${requestHost}` : null;
  const configuredOrigin = extractOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  const isLoopback =
    requestHost !== null && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(requestHost);

  const isSameOrigin =
    requestOrigin !== null &&
    (requestOrigin === requestOwnOrigin ||
      requestOrigin === configuredOrigin ||
      (isLoopback && requestOrigin === `http://${requestHost}`));

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
