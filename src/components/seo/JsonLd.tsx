import { SITE_NAME, SITE_URL, SITE_DESCRIPTION } from '@/lib/site'

// Site-wide structured data (Organization + WebSite), rendered once in the
// root layout. Static content built from site constants - no user input - so
// the JSON is safe to inline. Gives search engines a clean entity + site
// graph the pages otherwise lacked entirely.
export default function JsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        logo: `${SITE_URL}/opengraph-image`,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
