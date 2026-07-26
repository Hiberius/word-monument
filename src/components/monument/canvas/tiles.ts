import { getSupabasePublic, isSupabaseConfigured } from "@/lib/supabase/public";
import { GRID_SIZE, TILE_SIZE } from "@/lib/config";
import type { CellStatus } from "@/lib/types";
import { tileKey, type CellBounds, type TileCoord } from "@/lib/monument/tile-math";
import { demoCellsInBounds, demoTileSummaries } from "@/lib/monument/demoData";

/** Cells per tile - 50x50 - used to normalize sold-count into a 0..1 density. */
export const CELLS_PER_TILE = TILE_SIZE * TILE_SIZE;

export interface TileSummaryRow {
  soldCount: number;
}

/**
 * Lighter-weight cell shape than the full `Cell` type: cells_public only
 * exposes (id, x, y, status, character, updated_at) - no reservationId or
 * moderationStatus, which are private to the reserving session.
 */
export interface PublicCell {
  id: number;
  x: number;
  y: number;
  status: CellStatus;
  character: string | null;
  backgroundColor: string | null;
  updatedAt: string;
}

const TILE_STALE_MS = 60_000;

/**
 * In-memory tile/cell cache for the canvas engine. One instance per mounted
 * MonumentExplorer. No IndexedDB - a plain Map is sufficient at this scale
 * for a first version.
 */
export class TileDataStore {
  readonly tileSummaries = new Map<string, TileSummaryRow>();
  /** Bumped every time tile_summary is (re)loaded, so the renderer knows to rebuild its Tier 0 bitmap. */
  summaryVersion = 0;
  private summaryPromise: Promise<void> | null = null;

  readonly cellCache = new Map<string, PublicCell>();
  private loadedTileAt = new Map<string, number>();
  private inflightTiles = new Set<string>();

  /** Fetched once on mount for all 400 rows and held in memory (Tier 1 / Tier 0 source). */
  async loadTileSummaries(): Promise<void> {
    if (this.summaryPromise) return this.summaryPromise;
    this.summaryPromise = (async () => {
      if (!isSupabaseConfigured()) {
        for (const row of demoTileSummaries()) {
          this.tileSummaries.set(tileKey(row.tile_x, row.tile_y), { soldCount: row.sold_count });
        }
        this.summaryVersion += 1;
        return;
      }

      try {
        const supabase = getSupabasePublic();
        // Assumed tile_summary columns: tile_x, tile_y, sold_count (owned by the
        // backend-core agent). Adjust this select() if the real schema differs.
        const { data, error } = await supabase
          .from("tile_summary")
          .select("tile_x, tile_y, sold_count");

        if (error || !data) {
          // Leave tileSummaries empty - Tier 0/1 fall back to flat parchment
          // until a later retry or viewport-triggered refetch succeeds.
          return;
        }

        for (const row of data as { tile_x: number; tile_y: number; sold_count: number | null }[]) {
          this.tileSummaries.set(tileKey(row.tile_x, row.tile_y), {
            soldCount: row.sold_count ?? 0,
          });
        }
        this.summaryVersion += 1;
      } catch (err) {
        // A misconfigured/unreachable Supabase project must never crash the
        // canvas - this was previously an uncaught throw from
        // getSupabasePublic() that propagated out of this promise with no
        // .catch() at any call site, taking down the whole page.
        console.warn("[monument/tiles] loadTileSummaries failed, leaving grid empty", err);
      }
    })();
    return this.summaryPromise;
  }

  getCell(x: number, y: number): PublicCell | undefined {
    return this.cellCache.get(cellKey(x, y));
  }

  /**
   * Cell-space bounding box of the placed content, or null when the grid is
   * empty. Lets the view fit to (and not zoom out past) where content actually
   * is, instead of framing the whole empty million-cell grid as a speck in a
   * void. Prefers the exact sold-CELL extent (tight enough to read the words);
   * falls back to whole-tile granularity from the summaries when no cells are
   * loaded yet.
   */
  contentBounds(): CellBounds | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let anyCell = false;
    for (const cell of this.cellCache.values()) {
      if (cell.status !== "sold") continue;
      minX = Math.min(minX, cell.x);
      maxX = Math.max(maxX, cell.x);
      minY = Math.min(minY, cell.y);
      maxY = Math.max(maxY, cell.y);
      anyCell = true;
    }
    if (anyCell) return { minX, minY, maxX, maxY };

    // Fallback: whole tiles that report sold cells (coarser, but covers content
    // outside the loaded region).
    let minTx = Infinity;
    let minTy = Infinity;
    let maxTx = -Infinity;
    let maxTy = -Infinity;
    let anyTile = false;
    for (const [key, summary] of this.tileSummaries) {
      if (summary.soldCount <= 0) continue;
      const comma = key.indexOf(",");
      const tx = Number(key.slice(0, comma));
      const ty = Number(key.slice(comma + 1));
      minTx = Math.min(minTx, tx);
      maxTx = Math.max(maxTx, tx);
      minTy = Math.min(minTy, ty);
      maxTy = Math.max(maxTy, ty);
      anyTile = true;
    }
    if (!anyTile) return null;
    return {
      minX: minTx * TILE_SIZE,
      minY: minTy * TILE_SIZE,
      maxX: Math.min(maxTx * TILE_SIZE + TILE_SIZE - 1, GRID_SIZE - 1),
      maxY: Math.min(maxTy * TILE_SIZE + TILE_SIZE - 1, GRID_SIZE - 1),
    };
  }

  private needsFetch(tiles: TileCoord[]): TileCoord[] {
    const now = Date.now();
    return tiles.filter((t) => {
      const key = tileKey(t.tx, t.ty);
      if (this.inflightTiles.has(key)) return false;
      const loadedAt = this.loadedTileAt.get(key);
      if (loadedAt === undefined) return true;
      return now - loadedAt > TILE_STALE_MS;
    });
  }

  /**
   * Diffs the requested tiles against the cache and fetches only what's
   * missing/stale, in ONE batched query scoped to the combined bounding box
   * of the needed tiles (not one request per tile).
   */
  async fetchTiles(tiles: TileCoord[]): Promise<void> {
    const pending = this.needsFetch(tiles);
    if (pending.length === 0) return;

    for (const t of pending) this.inflightTiles.add(tileKey(t.tx, t.ty));

    // Only a fetch that actually returned data may mark these tiles loaded.
    let succeeded = false;

    try {
      const bounds = boundingBoxOfTiles(pending);

      if (!isSupabaseConfigured()) {
        for (const cell of demoCellsInBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY)) {
          this.cellCache.set(cellKey(cell.x, cell.y), {
            id: cell.y * GRID_SIZE + cell.x,
            x: cell.x,
            y: cell.y,
            status: cell.status,
            character: cell.character,
            backgroundColor: cell.backgroundColor,
            updatedAt: new Date(0).toISOString(),
          });
        }
        succeeded = true;
        return;
      }

      const supabase = getSupabasePublic();

      // Only claimed cells are fetched. 'available' is the default state and
      // the renderer draws nothing for it, so asking for it would pull tens of
      // thousands of rows per viewport for no visual gain and, far worse, blow
      // through PostgREST's row ceiling: the response would be silently
      // truncated and real sold cells would vanish from the grid. Cache misses
      // already mean "not claimed" everywhere getCell() is consulted.
      //
      // Paged so a densely-sold region is still fetched in full: PostgREST caps
      // a single response (1000 rows by default), so keep requesting the next
      // page until one comes back short. PAGE_CAP bounds the worst case.
      const PAGE_SIZE = 1000;
      const PAGE_CAP = 30;
      let ok = true;

      for (let page = 0; page < PAGE_CAP; page++) {
        const from = page * PAGE_SIZE;
        const { data, error } = await supabase
          .from("cells_public")
          .select("id, x, y, status, character, background_color, updated_at")
          .neq("status", "available")
          .gte("x", bounds.minX)
          .lte("x", bounds.maxX)
          .gte("y", bounds.minY)
          .lte("y", bounds.maxY)
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          // postgrest-js reports network/5xx as `error` rather than throwing.
          console.warn("[monument/tiles] fetchTiles query failed", error);
          ok = false;
          break;
        }

        const rows = (data ?? []) as {
          id: number;
          x: number;
          y: number;
          status: CellStatus;
          character: string | null;
          background_color: string | null;
          updated_at: string;
        }[];

        for (const row of rows) {
          this.cellCache.set(cellKey(row.x, row.y), {
            id: row.id,
            x: row.x,
            y: row.y,
            status: row.status,
            character: row.character,
            backgroundColor: row.background_color,
            updatedAt: row.updated_at,
          });
        }

        if (rows.length < PAGE_SIZE) break;
      }

      succeeded = ok;
    } catch (err) {
      // Same rationale as loadTileSummaries - a network/config error here
      // must degrade to "this tile stays empty for now", never crash the canvas.
      console.warn("[monument/tiles] fetchTiles failed for a tile batch", err);
    } finally {
      const now = Date.now();
      for (const t of pending) {
        const key = tileKey(t.tx, t.ty);
        // Only mark a tile loaded when its data actually arrived. Stamping it
        // on failure would freeze the region as empty for the whole stale
        // window, hiding real sold cells until TILE_STALE_MS elapsed.
        if (succeeded) this.loadedTileAt.set(key, now);
        this.inflightTiles.delete(key);
      }
    }
  }
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function boundingBoxOfTiles(tiles: TileCoord[]): CellBounds {
  let minTx = Infinity;
  let minTy = Infinity;
  let maxTx = -Infinity;
  let maxTy = -Infinity;
  for (const t of tiles) {
    minTx = Math.min(minTx, t.tx);
    minTy = Math.min(minTy, t.ty);
    maxTx = Math.max(maxTx, t.tx);
    maxTy = Math.max(maxTy, t.ty);
  }
  return {
    minX: minTx * TILE_SIZE,
    minY: minTy * TILE_SIZE,
    maxX: Math.min(maxTx * TILE_SIZE + TILE_SIZE - 1, GRID_SIZE - 1),
    maxY: Math.min(maxTy * TILE_SIZE + TILE_SIZE - 1, GRID_SIZE - 1),
  };
}
