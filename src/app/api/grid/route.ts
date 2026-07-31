import { NextResponse } from 'next/server';
import { GRID_SIZE, TILE_SIZE } from '@/lib/config';
import { getSupabasePublic, isSupabaseConfigured } from '@/lib/supabase/public';
import { demoCellsInBounds, demoTileSummaries } from '@/lib/monument/demoData';
import type { CellBounds } from '@/lib/monument/tile-math';
import type { CellStatus } from '@/lib/types';

/**
 * The single public read surface for the grid: tile summaries (?view=tiles)
 * and the claimed cells inside a bounding box (?view=cells).
 *
 * The canvas used to query PostgREST straight from the browser, which bypasses
 * Cloudflare and Next entirely - every visitor's viewport landed 1:1 on the
 * Supabase connection pool with nothing in front of it, so the traffic spike
 * this product exists to cause was also the thing that would take the database
 * down. Behind this route the edge collapses thousands of identical viewport
 * requests into a single origin hit.
 */

// Tile summaries are a coarse density map that barely moves, so they tolerate a
// much longer TTL than the per-cell read, where a buyer expects to see their own
// inscription appear shortly after paying. max-age=0 keeps private caches out of
// it entirely: only the shared edge cache may serve a slightly stale grid.
const TILE_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
const CELL_CACHE_CONTROL = 'public, max-age=0, s-maxage=15, stale-while-revalidate=60';
const NO_CACHE = 'no-store';

// PostgREST caps a single response (1000 rows by default), so a densely claimed
// box has to be paged. PAGE_CAP bounds the worst case; the pages are requested
// in waves rather than one at a time so a dense viewport does not serialize 30
// round trips, and PAGE_CONCURRENCY bounds how many PostgREST connections a
// single cache miss may open.
const PAGE_SIZE = 1000;
const PAGE_CAP = 30;
const PAGE_CONCURRENCY = 6;

interface CellRow {
  id: number;
  x: number;
  y: number;
  status: CellStatus;
  character: string | null;
  background_color: string | null;
  updated_at: string;
}

interface WireCell {
  id: number;
  x: number;
  y: number;
  status: CellStatus;
  character: string | null;
  backgroundColor: string | null;
  updatedAt: string;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const params = url.searchParams;
  const view = params.get('view');

  if (view === 'tiles') {
    return withEdgeCache(
      `${url.origin}/api/grid?view=tiles`,
      TILE_CACHE_CONTROL,
      tileSummariesResponse
    );
  }

  if (view === 'cells') {
    const bounds = parseBounds(params);
    if (typeof bounds === 'string') return badRequest(bounds);
    // Keyed on the SNAPPED bounds, never the raw query. The snapping below
    // already bounds how much work the origin does, but the cache key is what
    // bounds how many entries exist: keyed on the raw URL, panning by one cell
    // (or an attacker jittering minX) would mint a brand new entry holding a
    // byte-identical body, and the hit rate would collapse to zero precisely
    // when traffic is highest. Param order is fixed here for the same reason.
    const key =
      bounds === null
        ? `${url.origin}/api/grid?view=cells&empty=1`
        : `${url.origin}/api/grid?view=cells&minX=${bounds.minX}&minY=${bounds.minY}&maxX=${bounds.maxX}&maxY=${bounds.maxY}`;
    return withEdgeCache(key, CELL_CACHE_CONTROL, () => cellsResponse(bounds));
  }

  return badRequest("view must be 'tiles' or 'cells'");
}

/**
 * Serve from, and populate, the Cloudflare edge cache.
 *
 * Cloudflare does not cache a Worker's own response just because it carries
 * s-maxage: without an explicit Cache API write (or a dashboard Cache Rule)
 * every request recomputes, which was measurably the case here. That is
 * survivable while the grid is generated demo data and fatal once it is a
 * Supabase query, because it puts the whole traffic spike back on the
 * connection pool this route exists to shield.
 *
 * Kept in code rather than as a dashboard Cache Rule so it is reviewable in
 * the repo and cannot be silently lost by someone editing rules in a UI.
 *
 * Failures are swallowed on purpose: an unavailable Cache API (next dev, or a
 * runtime that does not expose caches.default) must degrade to "compute every
 * time", never to a 500 on the grid's only read path.
 */
async function withEdgeCache(
  cacheKeyUrl: string,
  cacheControl: string,
  compute: () => Promise<NextResponse>
): Promise<NextResponse> {
  const cache = await openEdgeCache();
  if (!cache) return compute();

  const cacheKey = new Request(cacheKeyUrl, { method: 'GET' });

  try {
    const hit = await cache.match(cacheKey);
    if (hit) {
      // The stored response is replayed with its Cache-Control rewritten from
      // the constants above rather than copied verbatim. Cloudflare stamps its
      // zone Browser Cache TTL onto what comes back out of caches.default, so
      // a hit was leaving here as max-age=14400: the grid would sit in each
      // visitor's own browser for four hours, and a buyer returning from
      // checkout would not see the cell they just paid for. That is the exact
      // outcome max-age=0 was chosen to prevent.
      const headers = new Headers(hit.headers);
      headers.set('Cache-Control', cacheControl);
      return new NextResponse(hit.body, { status: hit.status, headers });
    }
  } catch {
    // Fall through to a live computation rather than failing the request.
  }

  const response = await compute();

  // Only successful answers are stored. An edge-cached 502 would freeze a
  // region of the monument as empty for the whole TTL, and a cached 400 would
  // pin a bad request's error to a key a good request could later want.
  if (response.ok) {
    try {
      // The Cache API derives its TTL from the response's own s-maxage, so the
      // two TTL constants above remain the single source of truth.
      await cache.put(cacheKey, response.clone());
    } catch {
      // Storing is best effort; the caller still gets its response.
    }
  }

  return response;
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

async function openEdgeCache(): Promise<EdgeCache | null> {
  try {
    // `caches.default` is a Workers extension and is absent from the standard
    // CacheStorage type, hence the narrow cast rather than a global shim.
    const store = (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches;
    return store?.default ?? null;
  } catch {
    return null;
  }
}

async function tileSummariesResponse(): Promise<NextResponse> {
  if (!isSupabaseConfigured()) {
    const tiles = demoTileSummaries().map((row) => [row.tile_x, row.tile_y, row.sold_count]);
    return NextResponse.json({ tiles }, { headers: { 'Cache-Control': TILE_CACHE_CONTROL } });
  }

  try {
    const supabase = getSupabasePublic();
    const { data, error } = await supabase.from('tile_summary').select('tile_x, tile_y, sold_count');

    if (error || !data) {
      console.warn('[api/grid] tile_summary query failed', error);
      return upstreamUnavailable();
    }

    const rows = data as { tile_x: number; tile_y: number; sold_count: number | null }[];
    // Tuples rather than objects: 400 rows go out on every cold cache, and the
    // client only ever reads the three values positionally.
    const tiles = rows.map((row) => [row.tile_x, row.tile_y, row.sold_count ?? 0]);

    return NextResponse.json({ tiles }, { headers: { 'Cache-Control': TILE_CACHE_CONTROL } });
  } catch (err) {
    console.warn('[api/grid] tile_summary read threw', err);
    return upstreamUnavailable();
  }
}

/**
 * The snapped bounding box to read, `null` for a viewport entirely off the
 * grid (a legitimate request with nothing in it, not an error), or a string
 * carrying the reason the parameters were rejected.
 *
 * Split out of cellsResponse so the caller can derive a canonical cache key
 * from the snapped bounds before deciding whether any work is needed at all.
 */
function parseBounds(params: URLSearchParams): CellBounds | null | string {
  const minX = parseCoord(params.get('minX'));
  const minY = parseCoord(params.get('minY'));
  const maxX = parseCoord(params.get('maxX'));
  const maxY = parseCoord(params.get('maxY'));

  if (minX === null || minY === null || maxX === null || maxY === null) {
    return 'minX, minY, maxX and maxY must all be integers';
  }

  if (minX > maxX || minY > maxY) {
    return 'minX must not exceed maxX, and minY must not exceed maxY';
  }

  if (maxX < 0 || maxY < 0 || minX > GRID_SIZE - 1 || minY > GRID_SIZE - 1) {
    return null;
  }

  // Clamped to the grid, then widened to whole tile edges so the number of
  // distinct cache keys stays bounded (whole tiles, not a million pixel-exact
  // boxes). Without this, panning by a single cell - or an attacker jittering
  // the bounds - would miss the edge cache on every request and put the origin
  // back in the line of fire.
  return {
    minX: snapToTileStart(minX),
    minY: snapToTileStart(minY),
    maxX: snapToTileEnd(maxX),
    maxY: snapToTileEnd(maxY),
  };
}

async function cellsResponse(bounds: CellBounds | null): Promise<NextResponse> {
  if (bounds === null) {
    return NextResponse.json({ cells: [] }, { headers: { 'Cache-Control': CELL_CACHE_CONTROL } });
  }

  if (!isSupabaseConfigured()) {
    const cells = demoCellsInBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY).map(
      (cell) => ({
        id: cell.y * GRID_SIZE + cell.x,
        x: cell.x,
        y: cell.y,
        status: cell.status,
        character: cell.character,
        backgroundColor: cell.backgroundColor,
        updatedAt: new Date(0).toISOString(),
      })
    );
    return NextResponse.json({ cells }, { headers: { 'Cache-Control': CELL_CACHE_CONTROL } });
  }

  try {
    const cells = await fetchClaimedCells(bounds);
    if (cells === null) return upstreamUnavailable();
    return NextResponse.json({ cells }, { headers: { 'Cache-Control': CELL_CACHE_CONTROL } });
  } catch (err) {
    console.warn('[api/grid] cells_public read threw', err);
    return upstreamUnavailable();
  }
}

/** Every claimed cell in the box, or null if any page of the read failed. */
async function fetchClaimedCells(bounds: CellBounds): Promise<WireCell[] | null> {
  const supabase = getSupabasePublic();
  const cells: WireCell[] = [];

  for (let base = 0; base < PAGE_CAP; base += PAGE_CONCURRENCY) {
    const wave = Math.min(PAGE_CONCURRENCY, PAGE_CAP - base);
    const pages = await Promise.all(
      Array.from({ length: wave }, (_, offset) => fetchCellPage(supabase, bounds, base + offset))
    );

    let exhausted = false;
    for (const rows of pages) {
      // A partial answer would render as "those cells are unclaimed", which is
      // worse than no answer at all: the caller retries on failure but caches
      // success.
      if (rows === null) return null;

      for (const row of rows) {
        cells.push({
          id: row.id,
          x: row.x,
          y: row.y,
          status: row.status,
          character: row.character,
          backgroundColor: row.background_color,
          updatedAt: row.updated_at,
        });
      }

      // Pages are contiguous id-ordered ranges, so one short page proves there
      // is nothing past it: the rest of this wave came back empty and no
      // further wave is needed.
      if (rows.length < PAGE_SIZE) exhausted = true;
    }

    if (exhausted) break;
  }

  return cells;
}

async function fetchCellPage(
  supabase: ReturnType<typeof getSupabasePublic>,
  bounds: CellBounds,
  page: number
): Promise<CellRow[] | null> {
  const from = page * PAGE_SIZE;

  // Only claimed cells are fetched. 'available' is the default state and the
  // renderer draws nothing for it, so asking for it would pull tens of thousands
  // of rows per viewport for no visual gain and, far worse, blow through
  // PostgREST's row ceiling: the response would be silently truncated and real
  // sold cells would vanish from the grid. A cache miss already means "not
  // claimed" everywhere the canvas consults it.
  const { data, error } = await supabase
    .from('cells_public')
    .select('id, x, y, status, character, background_color, updated_at')
    .neq('status', 'available')
    .gte('x', bounds.minX)
    .lte('x', bounds.maxX)
    .gte('y', bounds.minY)
    .lte('y', bounds.maxY)
    .order('id', { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    // postgrest-js reports network/5xx as `error` rather than throwing.
    console.warn('[api/grid] cells_public page query failed', error);
    return null;
  }

  return (data ?? []) as CellRow[];
}

/** An integer query param, or null when absent, blank or not a whole number. */
function parseCoord(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function snapToTileStart(value: number): number {
  return Math.floor(clampToGrid(value) / TILE_SIZE) * TILE_SIZE;
}

function snapToTileEnd(value: number): number {
  const tileStart = Math.floor(clampToGrid(value) / TILE_SIZE) * TILE_SIZE;
  return Math.min(tileStart + TILE_SIZE - 1, GRID_SIZE - 1);
}

function clampToGrid(value: number): number {
  return Math.min(GRID_SIZE - 1, Math.max(0, value));
}

function badRequest(message: string): NextResponse {
  return NextResponse.json(
    { error: message },
    { status: 400, headers: { 'Cache-Control': NO_CACHE } }
  );
}

function upstreamUnavailable(): NextResponse {
  // Never cached: the canvas retries a failed region on the next pan, and an
  // edge-cached failure would freeze a whole area of the monument as empty.
  return NextResponse.json(
    { error: 'Grid data is temporarily unavailable' },
    { status: 502, headers: { 'Cache-Control': NO_CACHE } }
  );
}
