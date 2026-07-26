import type { ReactNode } from 'react'
import { MONO_FONT, SERIF_FONT } from './fonts'

// Shared visual language for the OG + share cards, the "Civic Ledger frontispiece":
// an engraved double-rule frame, monospace grid cells, parchment/ink, and one
// rationed stamp-red. Both cards import this so they read as one document family.
// Every element with >1 child sets display:flex and every cell carries explicit
// width/height: satori (next/og) requires both or it collapses silently.

export const C = {
  parchment: '#F6F1E7',
  ink: '#1A1710',
  red: '#B23A2E',
  paper: '#E7DCC4',
  hairline: 'rgba(26, 23, 16, 0.16)',
  zoneRule: 'rgba(26, 23, 16, 0.22)',
  innerRule: 'rgba(26, 23, 16, 0.38)',
}

// Deterministic glyph-contrast lookup (never computed at render). Dark curated
// fills get a parchment glyph; light fills (paper, ochre, parchment) get ink.
// Ochre #AD7C2E deliberately takes ink (contrast ~4.8:1 beats parchment ~3.4:1).
const DARK_BG = new Set(['#5E6A49', '#3C5A57', '#3E4C59', '#5A3E52', '#1A1710', '#B23A2E'])

export function glyphColorForBg(bg: string): string {
  return DARK_BG.has(bg.toUpperCase()) ? C.parchment : C.ink
}

export interface Glyph {
  char: string
  /** Cell background hex, or null for an empty (space / unsold) ledger cell. */
  bg: string | null
}

/** Turns a raw message into ledger cells: every character is a cell, spaces are
 *  empty parchment cells so the row never fragments. One bg color for all
 *  letters (a real reservation carries a single chosen color). */
export function messageToGlyphs(message: string, bg: string): Glyph[] {
  return Array.from(message).map((ch) => (ch === ' ' ? { char: ' ', bg: null } : { char: ch, bg }))
}

/** The engraved double-rule frame + relative content box shared by both cards. */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: C.parchment,
        fontFamily: MONO_FONT,
        padding: 40,
      }}
    >
      <div style={{ display: 'flex', flex: 1, border: `2px solid ${C.ink}`, padding: 7 }}>
        <div
          style={{
            display: 'flex',
            position: 'relative',
            flex: 1,
            flexDirection: 'column',
            justifyContent: 'space-between',
            border: `1px solid ${C.innerRule}`,
            padding: 30,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/** One square ledger cell: a filled color + contrast glyph, or an empty gap. */
export function Cell({ glyph, size, fontSize }: { glyph: Glyph; size: number; fontSize: number }) {
  const filled = glyph.bg !== null && glyph.char !== ' '
  return (
    <div
      style={{
        display: 'flex',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${C.hairline}`,
        backgroundColor: filled ? (glyph.bg as string) : C.parchment,
      }}
    >
      {filled ? (
        <div
          style={{
            display: 'flex',
            fontFamily: MONO_FONT,
            fontSize,
            letterSpacing: 0,
            color: glyphColorForBg(glyph.bg as string),
          }}
        >
          {glyph.char}
        </div>
      ) : (
        <div style={{ display: 'flex' }} />
      )}
    </div>
  )
}

/** A sequence of ledger cells; wraps (centered) when `wrap`, else a single row. */
export function CellSequence({
  glyphs,
  size,
  fontSize,
  wrap = false,
}: {
  glyphs: Glyph[]
  size: number
  fontSize: number
  wrap?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: wrap ? 'wrap' : 'nowrap',
        justifyContent: 'center',
        alignContent: 'center',
        ...(wrap ? { width: 980 } : {}),
      }}
    >
      {glyphs.map((g, i) => (
        <Cell key={i} glyph={g} size={size} fontSize={fontSize} />
      ))}
    </div>
  )
}

/** Uppercase, tracked mono metadata: the ledger's structural voice. */
export function MonoLabel({
  children,
  size = 14,
  tracking = 0.22,
  color = 'rgba(26, 23, 16, 0.66)',
}: {
  children: ReactNode
  size?: number
  tracking?: number
  color?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        fontFamily: MONO_FONT,
        fontSize: size,
        textTransform: 'uppercase',
        letterSpacing: `${tracking}em`,
        color,
      }}
    >
      {children}
    </div>
  )
}

export { SERIF_FONT, MONO_FONT }

/**
 * Length → cell/glyph size ladder for the dynamic hero message so it never
 * overflows the 980px band or 3 rows. N counts every character incl. spaces.
 */
export function cellSizingFor(n: number): { size: number; fontSize: number } {
  if (n <= 12) return { size: 64, fontSize: 32 }
  if (n <= 24) return { size: 52, fontSize: 26 }
  if (n <= 42) return { size: 44, fontSize: 22 }
  return { size: 38, fontSize: 19 }
}

/** Caps the glyph list so a very long message can't blow past the layout. */
export function clampGlyphs(glyphs: Glyph[], max = 72): Glyph[] {
  if (glyphs.length <= max) return glyphs
  return [...glyphs.slice(0, max - 1), { char: '...', bg: null }]
}
