// Site-wide constants used across metadata, SEO routes and share surfaces.
// Centralized so copy and URLs stay consistent without hunting through every page.

export const SITE_NAME = 'Word Monument'

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://wordmonument.com'

export const SITE_TAGLINE = 'A monument built one word at a time.'

export const SITE_DESCRIPTION =
  'One dollar. One letter. Yours, forever. Claim a cell on a permanent, million-cell monument. Every cell sells exactly once, and once a word is placed it never comes down.'

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
