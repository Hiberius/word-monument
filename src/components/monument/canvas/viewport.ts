import { GRID_SIZE } from "@/lib/config";
import type { CellBounds } from "@/lib/monument/tile-math";
import {
  LOD_TIER_1_MIN_PX_PER_CELL,
  LOD_TIER_2_MIN_PX_PER_CELL,
  LOD_TIER_3_MIN_PX_PER_CELL,
  MAX_PX_PER_CELL,
} from "./palette";

/**
 * Viewport state: scale (pixels per cell) and origin (fractional cell-space
 * coordinate at the canvas's top-left). Lives in a plain mutable object,
 * mutated directly by gesture handlers, and drawn via requestAnimationFrame -
 * panning/zooming must NEVER trigger a React re-render.
 */
export interface ViewportState {
  scale: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  dpr: number;
  /** Zoom-out floor (px/cell). Set to the scale that frames the placed content
   *  so you can't zoom out into the empty void beyond it. Undefined = fit the
   *  whole grid (the original behavior). */
  minScale?: number;
}

export interface CellPoint {
  x: number;
  y: number;
}

export type LodTier = 0 | 1 | 2 | 3;

/**
 * Default opening zoom, in px/cell. Tier 3 (> LOD_TIER_3_MIN) so glyphs and
 * cell selection are live the instant the explorer opens - it must never open
 * on the blank far-zoom expanse where a mostly-unsold million-cell grid reads
 * as empty/broken. Low enough within tier 3 that a meaningful patch of the
 * ledger is visible at once.
 */
export const DEFAULT_PX_PER_CELL = 30;

/**
 * Cell the opening view centers on when no other center is given - the middle
 * of the grid, which is also where the monument's featured inscription lives.
 */
const DEFAULT_CENTER: CellPoint = { x: 500, y: 500 };

export function createViewport(
  width: number,
  height: number,
  dpr: number,
  center: CellPoint = DEFAULT_CENTER,
): ViewportState {
  const vp: ViewportState = {
    scale: DEFAULT_PX_PER_CELL,
    originX: 0,
    originY: 0,
    width,
    height,
    dpr,
  };
  centerViewportOn(vp, center.x, center.y);
  return vp;
}

/**
 * Recenter the viewport on a cell, keeping the current scale, then clamp.
 *
 * `bottomInsetPx` is the height of anything overlapping the bottom of the
 * canvas, in practice the selection tray, which on a phone covers close to half
 * the grid. Centering on the geometric middle would then park the buyer's own
 * words underneath it, which is exactly what they came to look at. Passing the
 * inset centers within the band that is actually visible instead.
 */
export function centerViewportOn(
  vp: ViewportState,
  cellX: number,
  cellY: number,
  bottomInsetPx = 0,
): void {
  const visibleHeight = Math.max(1, vp.height - bottomInsetPx);
  vp.originX = cellX - vp.width / vp.scale / 2;
  vp.originY = cellY - visibleHeight / vp.scale / 2;
  clampViewport(vp);
}

/** The zoomed-out floor: the scale at which the entire grid just fits the viewport. */
export function minScaleToFit(width: number, height: number): number {
  if (width <= 0 || height <= 0) return MAX_PX_PER_CELL;
  return Math.min(width, height) / GRID_SIZE;
}

/** px/cell that fits a cell-space region (plus padding) into the viewport. */
export function fitScaleForBounds(vp: ViewportState, bounds: CellBounds, paddingCells: number): number {
  const w = bounds.maxX - bounds.minX + 1 + paddingCells * 2;
  const h = bounds.maxY - bounds.minY + 1 + paddingCells * 2;
  if (w <= 0 || h <= 0) return MAX_PX_PER_CELL;
  return Math.min(vp.width / w, vp.height / h);
}

/** Scales + centers the viewport to frame a region (plus padding). */
export function fitViewportToBounds(vp: ViewportState, bounds: CellBounds, paddingCells: number): void {
  vp.scale = Math.min(fitScaleForBounds(vp, bounds, paddingCells), MAX_PX_PER_CELL);
  const cx = (bounds.minX + bounds.maxX + 1) / 2;
  const cy = (bounds.minY + bounds.maxY + 1) / 2;
  centerViewportOn(vp, cx, cy);
}

/** Most-zoomed-out scale allowed: never past fitting the whole grid, but tighter
 *  when a content-based minScale is set (so you can't zoom into empty space). */
function effectiveMinScale(vp: ViewportState): number {
  const gridFit = minScaleToFit(vp.width, vp.height);
  return Math.min(MAX_PX_PER_CELL, Math.max(gridFit, vp.minScale ?? 0));
}

export function clampViewport(vp: ViewportState): void {
  const floor = effectiveMinScale(vp);
  vp.scale = clamp(vp.scale, floor, MAX_PX_PER_CELL);

  const visibleCellsX = vp.width / vp.scale;
  const visibleCellsY = vp.height / vp.scale;
  vp.originX = clampOriginAxis(vp.originX, visibleCellsX);
  vp.originY = clampOriginAxis(vp.originY, visibleCellsY);
}

function clampOriginAxis(origin: number, visibleCells: number): number {
  if (visibleCells >= GRID_SIZE) return (GRID_SIZE - visibleCells) / 2;
  return clamp(origin, 0, GRID_SIZE - visibleCells);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function screenToCell(vp: ViewportState, screenX: number, screenY: number): CellPoint {
  return {
    x: vp.originX + screenX / vp.scale,
    y: vp.originY + screenY / vp.scale,
  };
}

export function cellToScreen(vp: ViewportState, cellX: number, cellY: number): CellPoint {
  return {
    x: (cellX - vp.originX) * vp.scale,
    y: (cellY - vp.originY) * vp.scale,
  };
}

/** Visible cell-space bounding box, optionally padded (e.g. one tile of prefetch margin). */
export function visibleCellBounds(vp: ViewportState, marginCells = 0): CellBounds {
  return {
    minX: vp.originX - marginCells,
    minY: vp.originY - marginCells,
    maxX: vp.originX + vp.width / vp.scale + marginCells,
    maxY: vp.originY + vp.height / vp.scale + marginCells,
  };
}

export function panBy(vp: ViewportState, dxPixels: number, dyPixels: number): void {
  vp.originX -= dxPixels / vp.scale;
  vp.originY -= dyPixels / vp.scale;
  clampViewport(vp);
}

/** Zooms by `factor`, keeping the cell under (screenX, screenY) fixed on screen. */
export function zoomAt(vp: ViewportState, screenX: number, screenY: number, factor: number): void {
  const before = screenToCell(vp, screenX, screenY);
  const fit = effectiveMinScale(vp);
  vp.scale = clamp(vp.scale * factor, fit, MAX_PX_PER_CELL);
  vp.originX = before.x - screenX / vp.scale;
  vp.originY = before.y - screenY / vp.scale;
  clampViewport(vp);
}

export function lodTierForScale(scale: number): LodTier {
  if (scale < LOD_TIER_1_MIN_PX_PER_CELL) return 0;
  if (scale < LOD_TIER_2_MIN_PX_PER_CELL) return 1;
  if (scale < LOD_TIER_3_MIN_PX_PER_CELL) return 2;
  return 3;
}

export { MAX_PX_PER_CELL };
