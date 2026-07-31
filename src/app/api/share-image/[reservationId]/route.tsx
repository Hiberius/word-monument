import { ImageResponse } from 'next/og'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getReservationCells } from '@/lib/db/cells'
import { isSupabaseConfigured } from '@/lib/supabase/public'
import { demoShareEntry } from '@/lib/monument/demoData'
import { SHARE_LINE } from '@/lib/site'
import { ogFonts } from '@/lib/og/fonts'
import { checkRateLimit } from '@/lib/security/rate-limit-kv'
import { getClientIp, hashIp } from '@/lib/security/rate-limit'
import {
  C,
  CellSequence,
  Frame,
  MonoLabel,
  SERIF_FONT,
  MONO_FONT,
  cellSizingFor,
  clampGlyphs,
  messageToGlyphs,
  type Glyph,
} from '@/lib/og/brand'

// Dynamic per-purchase share card (/api/share-image/<reservationId>). Renders
// the buyer's actual placed message as real ledger cells in their chosen color,
// stamped like a filed certificate. Runs per-request on the Worker; fonts are
// base64-embedded (ogFonts) so no fs/remote fetch is needed at runtime.

const SIZE = { width: 1200, height: 630 }

// Cache aggressively at the CDN: a card for a given reservation (or ?text) is
// stable, so Cloudflare serves repeat/crawler requests without re-hitting the
// Worker: the first line of defense for this unauthenticated image endpoint.
const CACHE_CONTROL = 'public, max-age=86400, s-maxage=86400, immutable'
const RATE_LIMIT_MAX_REQUESTS = 30
const RATE_LIMIT_WINDOW_SECONDS = 60

async function getRateLimitKv(): Promise<KVNamespace | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    return env.RATE_LIMIT
  } catch {
    return undefined
  }
}

interface ShareEntry {
  glyphs: Glyph[]
  message: string
  cellCount: number
  row: number | null
  colStart: number | null
  colEnd: number | null
  filedDate: string | null
  showStamp: boolean
}

function pad4(n: number): string {
  return String(n).padStart(4, '0')
}

function regNoFrom(reservationId: string): string {
  const cleaned = reservationId.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()
  return `WM-${cleaned || '000000'}`
}

/** Ordered sold cells (character + chosen bg) into ledger glyphs with word gaps. */
function cellsToEntry(
  cells: { x: number; y: number; character: string | null; backgroundColor: string | null; status: string; purchasedAt: string | null }[],
): ShareEntry | null {
  const sold = cells
    .filter((c) => c.status === 'sold' && c.character)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
  if (sold.length === 0) return null

  const glyphs: Glyph[] = []
  let prev: { x: number; y: number } | null = null
  for (const cell of sold) {
    if (prev && (cell.y !== prev.y || cell.x > prev.x + 1)) {
      glyphs.push({ char: ' ', bg: null }) // one gap cell between words / rows
    }
    glyphs.push({ char: cell.character as string, bg: cell.backgroundColor })
    prev = { x: cell.x, y: cell.y }
  }

  const xs = sold.map((c) => c.x)
  const filed = sold.find((c) => c.purchasedAt)?.purchasedAt ?? null

  return {
    glyphs,
    message: glyphs.map((g) => g.char).join(''),
    cellCount: sold.length,
    row: sold[0].y,
    colStart: Math.min(...xs),
    colEnd: Math.max(...xs),
    filedDate: filed ? filed.slice(0, 10) : null,
    showStamp: true,
  }
}

/**
 * Whether the ?text= preview override may be honoured.
 *
 * This used to be gated on "demo mode", on the reasoning that production would
 * always have Supabase configured. That assumption was wrong the moment the
 * real domain went live before the database did, and the consequence was not
 * cosmetic: ?text= renders arbitrary attacker text into a card captioned
 * CERTIFICATE OF INSCRIPTION, served from this domain, which Slack, Discord,
 * iMessage and X all unfurl inline as a genuine artifact. On a domain being
 * posted publicly that is a ready-made scam lure.
 *
 * Gated on the build environment instead, which is a fact about how the code
 * was compiled rather than a guess about how it was deployed.
 */
const ALLOW_PREVIEW_TEXT = process.env.NODE_ENV !== 'production'

function demoEntry(overrideText?: string | null): ShareEntry {
  const d = demoShareEntry()
  const requested = ALLOW_PREVIEW_TEXT ? overrideText : null
  const message = (requested ?? d.message).slice(0, 90)
  const cellCount = message.replace(/ /g, '').length
  return {
    glyphs: messageToGlyphs(message, d.backgroundColor),
    message,
    cellCount,
    row: d.startY,
    colStart: d.startX,
    colEnd: d.startX + message.length - 1,
    filedDate: '2026-07-13',
    showStamp: true,
  }
}

const GENERIC_ENTRY: ShareEntry = {
  glyphs: messageToGlyphs('YOUR WORDS, FOREVER', C.paper),
  message: 'YOUR WORDS, FOREVER',
  cellCount: 0,
  row: null,
  colStart: null,
  colEnd: null,
  filedDate: null,
  showStamp: false,
}

async function resolveEntry(reservationId: string, previewText?: string | null): Promise<ShareEntry> {
  if (!isSupabaseConfigured()) return demoEntry(previewText)
  try {
    const reservation = await getReservationCells(reservationId)
    return cellsToEntry(reservation.cells) ?? GENERIC_ENTRY
  } catch {
    // A broken share image must never be the reason /success fails to render.
    return GENERIC_ENTRY
  }
}

function MetaCell({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 22px',
        borderRight: last ? 'none' : `1px solid ${C.hairline}`,
      }}
    >
      <div style={{ display: 'flex', fontFamily: MONO_FONT, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(26, 23, 16, 0.55)' }}>
        {label}
      </div>
      <div style={{ display: 'flex', fontFamily: MONO_FONT, fontSize: 15, color: 'rgba(26, 23, 16, 0.9)', marginTop: 6 }}>
        {value}
      </div>
    </div>
  )
}

/** Reservation ids are uuids. Anything else cannot name a real card. */
const RESERVATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The one id that is not a uuid: the sample card the marketing pages link to. */
const DEMO_RESERVATION_ID = 'demo'

export async function GET(request: Request, { params }: { params: Promise<{ reservationId: string }> }) {
  const { reservationId } = await params

  // Rejected before any work happens. This is the most expensive endpoint on
  // the site (a Satori layout plus a resvg WASM rasterization of a 1200x630
  // PNG, hundreds of milliseconds of Worker CPU each), and robots.txt invites
  // crawlers into it so unfurl bots can fetch real cards. Without this gate an
  // unbounded space of junk ids each buys a full render, which is a cheap way
  // to burn the CPU budget of the whole site from one laptop.
  if (reservationId !== DEMO_RESERVATION_ID && !RESERVATION_ID_PATTERN.test(reservationId)) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=3600' },
    })
  }

  // Per-IP rate limit (fails open on a KV outage, like the rest of the app).
  const ipHash = await hashIp(getClientIp(request.headers))
  const withinLimit = await checkRateLimit(
    await getRateLimitKv(),
    `rl:share-image:${ipHash}`,
    RATE_LIMIT_MAX_REQUESTS,
    RATE_LIMIT_WINDOW_SECONDS,
  )
  if (!withinLimit) {
    return new Response('Too many requests', { status: 429 })
  }

  const previewText = new URL(request.url).searchParams.get('text')
  const entry = await resolveEntry(reservationId, previewText)
  const glyphs = clampGlyphs(entry.glyphs)
  const { size, fontSize } = cellSizingFor(glyphs.length)

  // The rotated stamp lives in the top-right corner, so it only shows when the
  // message renders on a single centered row (short inscriptions, the common
  // case). A wrapped multi-row grid would rise into the stamp; there the ledger
  // metadata table carries the "Filed" signal instead.
  const perRow = Math.max(1, Math.floor(980 / size))
  const stampVisible = entry.showStamp && Math.ceil(glyphs.length / perRow) === 1

  const coordParts: string[] = ['Entry']
  if (entry.row !== null) coordParts.push(`Row ${pad4(entry.row)}`)
  if (entry.colStart !== null && entry.colEnd !== null) coordParts.push(`Col ${pad4(entry.colStart)}-${pad4(entry.colEnd)}`)
  if (entry.filedDate) coordParts.push(`Filed ${entry.filedDate}`)

  const inscription = entry.message.length > 26 ? `${entry.message.slice(0, 26)}...` : entry.message

  return new ImageResponse(
    (
      <Frame>
        {/* Zone 1: masthead */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', fontFamily: SERIF_FONT, fontSize: 34, letterSpacing: -0.5, color: C.ink }}>
              Word Monument
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <MonoLabel size={13} tracking={0.22}>Certificate of Inscription</MonoLabel>
              <div style={{ display: 'flex', fontFamily: MONO_FONT, fontSize: 14, color: 'rgba(26, 23, 16, 0.88)', marginTop: 4 }}>
                {`REG. No. ${regNoFrom(reservationId)}`}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', height: 1, width: '100%', backgroundColor: C.zoneRule, marginTop: 14 }} />
        </div>

        {/* Zone 2: coordinate strip */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <MonoLabel size={12} tracking={0.2} color="rgba(26, 23, 16, 0.58)">
            {coordParts.join('  ·  ')}
          </MonoLabel>
        </div>

        {/* Zone 3, hero: the buyer's words as ledger cells */}
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <CellSequence glyphs={glyphs} size={size} fontSize={fontSize} wrap />
        </div>

        {/* Zone 4: ledger metadata table */}
        <div style={{ display: 'flex', borderTop: `1px solid ${C.ink}`, marginTop: 18, paddingTop: 14 }}>
          <MetaCell label="Inscription" value={`“${inscription}”`} />
          <MetaCell label="Cells" value={String(entry.cellCount).padStart(6, '0')} />
          <MetaCell label="Amount" value={`$${entry.cellCount}.00`} />
          <MetaCell label="Status" value={entry.showStamp ? 'Filed' : 'On File'} last />
        </div>

        {/* Zone 5: closing footer */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', height: 1, width: '100%', backgroundColor: C.zoneRule, marginTop: 16, marginBottom: 16 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', fontFamily: SERIF_FONT, fontSize: 26, lineHeight: 1.15, color: 'rgba(26, 23, 16, 0.86)', maxWidth: 640 }}>
              {SHARE_LINE}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <MonoLabel size={13} tracking={0.18} color="rgba(26, 23, 16, 0.75)">One dollar. One letter. Forever.</MonoLabel>
              <div style={{ display: 'flex', marginTop: 4 }}>
                <MonoLabel size={13} tracking={0.18} color="rgba(26, 23, 16, 0.7)">wordmonument.com &middot; Add yours</MonoLabel>
              </div>
            </div>
          </div>
        </div>

        {/* Registrar's stamp: the only added red on this card */}
        {stampVisible ? (
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 120,
              right: 60,
              flexDirection: 'column',
              alignItems: 'center',
              border: `2.5px solid ${C.red}`,
              borderRadius: 6,
              padding: '8px 18px',
              transform: 'rotate(-8deg)',
            }}
          >
            <div style={{ display: 'flex', fontFamily: MONO_FONT, fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.14em', color: C.red }}>
              Registered &middot; Paid
            </div>
            <div style={{ display: 'flex', fontFamily: MONO_FONT, fontSize: 12, letterSpacing: '0.12em', color: C.red, marginTop: 4 }}>
              {`$${entry.cellCount} · ${entry.cellCount} CELLS`}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex' }} />
        )}
      </Frame>
    ),
    { ...SIZE, fonts: ogFonts(), headers: { 'Cache-Control': CACHE_CONTROL } },
  )
}
