import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { SITE_URL } from '@/lib/site'

/** Hosts compare equal regardless of case or a leading www, so the apex and
 *  the www alias of the real domain are both treated as canonical. */
function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, '')
}

const CANONICAL_HOST = normalizeHost(new URL(SITE_URL).host)

export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers()
  // x-forwarded-host is what Next populates behind a proxy; it can carry a
  // comma-separated chain, in which case the first entry is the client's.
  const forwarded = requestHeaders.get('x-forwarded-host')?.split(',')[0]
  const host = normalizeHost(forwarded ?? requestHeaders.get('host') ?? '')

  // Preview deploys serve byte-identical content under their own hostname, so
  // left crawlable they compete with the real domain for the same pages and
  // can surface ahead of it. Only the canonical host gets a crawlable
  // robots.txt. workers.dev is refused outright rather than merely failing the
  // host comparison, so a preview cannot become indexable just by having
  // NEXT_PUBLIC_SITE_URL pointed at itself. Development is exempt so the
  // production rules stay inspectable under `next dev` on localhost.
  const isPreviewHost = host.endsWith('.workers.dev')
  const isCanonicalHost =
    !isPreviewHost && (host === CANONICAL_HOST || process.env.NODE_ENV !== 'production')

  if (!isCanonicalHost) {
    return {
      rules: [
        {
          userAgent: '*',
          disallow: '/',
        },
      ],
    }
  }

  return {
    rules: [
      {
        userAgent: '*',
        // The share-image allow sits alongside the blanket /api/ block because
        // link-unfurl bots (Twitterbot, facebookexternalhit) consult robots.txt
        // before fetching an og:image: without the carve-out, every shared
        // purchase would unfurl with no card at all. The more specific rule
        // wins for crawlers that follow the longest-match convention.
        allow: ['/', '/api/share-image/'],
        disallow: ['/api/', '/admin', '/checkout', '/success'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
