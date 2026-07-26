import { ImageResponse } from 'next/og'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site'
import { ogFonts } from '@/lib/og/fonts'
import { C, CellSequence, Frame, MonoLabel, SERIF_FONT, messageToGlyphs } from '@/lib/og/brand'

// Static, site-wide OG card: the link preview for wordmonument.com. Rendered
// once at build (Node) into a PNG. Reproduces the real on-site tribute as
// engraved ledger cells so the card is unmistakably THIS product, not a generic
// hero. Brand fonts (Instrument Serif + IBM Plex Mono) are base64-embedded and
// loaded via ogFonts() so the exact same code path also works at Worker runtime.

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = `${SITE_NAME}: ${SITE_TAGLINE}`

const TRIBUTE_CELL = 40
const TRIBUTE_GLYPH = 20

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <Frame>
        {/* Zone 1: masthead */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <MonoLabel tracking={0.24}>Public Ledger of Words</MonoLabel>
            <MonoLabel tracking={0.24}>01 / 1,000,000</MonoLabel>
          </div>
          <div style={{ display: 'flex', height: 1, width: '100%', backgroundColor: C.zoneRule, marginTop: 14 }} />
        </div>

        {/* Zone 2 + 3: title block and the authentic tribute grid */}
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', fontFamily: SERIF_FONT, fontSize: 92, lineHeight: 1, letterSpacing: -0.5, color: C.ink }}>
              {SITE_NAME}
            </div>
            <div style={{ display: 'flex', fontFamily: SERIF_FONT, fontSize: 32, color: 'rgba(26, 23, 16, 0.84)', marginTop: 16 }}>
              {SITE_TAGLINE}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 40 }}>
            <div style={{ display: 'flex', marginBottom: 14 }}>
              <MonoLabel size={13} tracking={0.22} color="rgba(26, 23, 16, 0.6)">
                Featured Inscription &middot; Cells 500,000-500,024
              </MonoLabel>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <CellSequence glyphs={messageToGlyphs('THE INTERNET FORGETS', C.paper)} size={TRIBUTE_CELL} fontSize={TRIBUTE_GLYPH} />
              <CellSequence glyphs={messageToGlyphs('THIS DOES NOT', C.red)} size={TRIBUTE_CELL} fontSize={TRIBUTE_GLYPH} />
              <CellSequence glyphs={messageToGlyphs('SAY IT WHERE IT STAYS', C.paper)} size={TRIBUTE_CELL} fontSize={TRIBUTE_GLYPH} />
            </div>
          </div>
        </div>

        {/* Zone 4: footer */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', height: 1, width: '100%', backgroundColor: C.zoneRule, marginBottom: 16 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <MonoLabel size={14} tracking={0.2} color={C.ink}>
              One dollar. One letter. Forever.
            </MonoLabel>
            <MonoLabel size={14} tracking={0.2} color="rgba(26, 23, 16, 0.7)">
              wordmonument.com
            </MonoLabel>
          </div>
        </div>
      </Frame>
    ),
    { ...size, fonts: ogFonts() },
  )
}
