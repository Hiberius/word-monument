import { GRID_SIZE, TILE_SIZE } from "@/lib/config";

export interface TileCoord {
  tx: number;
  ty: number;
}

/** Bounding box in fractional cell-space, inclusive of min, exclusive-ish of max (callers round as needed). */
export interface CellBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 1000 / 50 = 20 tiles per row/column, 400 tiles total. */
export const TILES_PER_ROW = Math.ceil(GRID_SIZE / TILE_SIZE);

export function tileKey(tx: number, ty: number): string {
  return `${tx},${ty}`;
}

/** Cell-space bounds covered by a single tile, both edges inclusive. */
export function tileBounds(tx: number, ty: number): CellBounds {
  const minX = tx * TILE_SIZE;
  const minY = ty * TILE_SIZE;
  return {
    minX,
    minY,
    maxX: minX + TILE_SIZE - 1,
    maxY: minY + TILE_SIZE - 1,
  };
}

/** All tiles whose cell range overlaps the given bounding box, clamped to the grid. */
export function tilesInViewport(bounds: CellBounds): TileCoord[] {
  if (
    bounds.maxX < 0 ||
    bounds.maxY < 0 ||
    bounds.minX > GRID_SIZE - 1 ||
    bounds.minY > GRID_SIZE - 1
  ) {
    return [];
  }

  const minTx = clamp(Math.floor(bounds.minX / TILE_SIZE), 0, TILES_PER_ROW - 1);
  const maxTx = clamp(Math.floor(bounds.maxX / TILE_SIZE), 0, TILES_PER_ROW - 1);
  const minTy = clamp(Math.floor(bounds.minY / TILE_SIZE), 0, TILES_PER_ROW - 1);
  const maxTy = clamp(Math.floor(bounds.maxY / TILE_SIZE), 0, TILES_PER_ROW - 1);

  const tiles: TileCoord[] = [];
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      tiles.push({ tx, ty });
    }
  }
  return tiles;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
