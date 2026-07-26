import { INSTRUMENT_SERIF_400_WOFF_BASE64, IBM_PLEX_MONO_400_WOFF_BASE64 } from './fontData'

// Font families for the OG/share cards, matching the site's real type system:
// Instrument Serif for the wordmark/display, IBM Plex Mono for the ledger grid
// and metadata. Names must match the fontFamily strings used in the card JSX.
export const SERIF_FONT = 'Instrument Serif'
export const MONO_FONT = 'IBM Plex Mono'

/**
 * Decodes base64 to a Uint8Array using globals present in BOTH the Node build
 * runtime and the Cloudflare Worker runtime (atob exists in both). Avoids
 * Buffer, which isn't guaranteed on workerd without the nodejs_compat flag in
 * every context.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  // Freshly-allocated Uint8Array over a plain (non-shared) ArrayBuffer, so the
  // cast is sound; it only narrows away the SharedArrayBuffer half of the union.
  return bytes.buffer as ArrayBuffer
}

export interface OgFont {
  name: string
  data: ArrayBuffer
  weight: 400
  style: 'normal'
}

let cachedFonts: OgFont[] | null = null

/** The fonts[] array to hand ImageResponse. Decoded once per isolate, then cached. */
export function ogFonts(): OgFont[] {
  if (cachedFonts) return cachedFonts
  const fonts: OgFont[] = [
    { name: SERIF_FONT, data: base64ToArrayBuffer(INSTRUMENT_SERIF_400_WOFF_BASE64), weight: 400, style: 'normal' },
    { name: MONO_FONT, data: base64ToArrayBuffer(IBM_PLEX_MONO_400_WOFF_BASE64), weight: 400, style: 'normal' },
  ]
  cachedFonts = fonts
  return fonts
}
