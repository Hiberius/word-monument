// Site-wide constants used across metadata, SEO routes and share surfaces.
// Centralized so copy and URLs stay consistent without hunting through every page.

export const SITE_NAME = 'Word Monument'

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://wordmonument.com'

export const SITE_TAGLINE = 'A monument built one word at a time.'

// Kept under ~155 characters: this is the search snippet, and the previous
// version ran to 169 and had its last clause cut off mid-sentence by Google.
export const SITE_DESCRIPTION =
  'One dollar. One letter. Yours, forever. Claim a cell on a permanent million-cell monument. Every cell sells once, and a placed word never comes down.'

// Operator identity shown on the legal pages + the About contact section.
// The operator is deliberately kept anonymous: the project speaks for
// itself, not a name, so the legal pages operate under the project's own
// name (swap for a registered legal entity before launch). The contact is a
// neutral role address at the site's own domain (stand up a real inbox for
// it; never a personal email).
export const OPERATOR_NAME = SITE_NAME
export const CONTACT_EMAIL = 'hello@wordmonument.com'

// The line every share surface, hero, and social card should carry.
export const SHARE_LINE =
  'I just added my words to a monument that will never come down. Add yours.'

/**
 * The site-wide social card, restated for any page that declares its own
 * `openGraph` block.
 *
 * app/opengraph-image.tsx covers the root segment, but Next does not merge it
 * into a child page's `openGraph`: declaring that object at all replaces the
 * inherited one wholesale, images included. The effect is silent and only
 * visible when someone shares the link, which is how /monument and /about
 * ended up unfurling with no image at all, /monument being the single page
 * most likely to be pasted into a post about this product.
 *
 * Any page that sets `openGraph` must therefore spread this in explicitly.
 * The generated route answers with or without the build hash Next appends, so
 * the plain path is safe to hardcode.
 */
export const SITE_OG_IMAGE = {
  url: `${SITE_URL}/opengraph-image`,
  width: 1200,
  height: 630,
  alt: `${SITE_NAME}: ${SITE_TAGLINE}`,
} as const
