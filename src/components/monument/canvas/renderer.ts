"use client";

import { GRID_SIZE } from "@/lib/config";
import { selectionStore } from "@/lib/monument/selection-store";
import { TILES_PER_ROW, tileBounds, tileKey, tilesInViewport } from "@/lib/monument/tile-math";
import {
  GRIDLINE,
  INK,
  INK_MUTED,
  PARCHMENT,
  SELECTION_OUTLINE,
  SOLD_FILL,
  contrastGlyphColor,
  tileDensityColor,
} from "./palette";
import { getCellColorById } from "@/lib/monument/colors";
import { CELLS_PER_TILE, type TileDataStore } from "./tiles";
import { cellToScreen, clampViewport, lodTierForScale, visibleCellBounds, type CellPoint, type ViewportState } from "./viewport";

// Mirrors --font-mono-grid from src/styles/tokens.css; duplicated as a literal
// for the same reason the palette constants are - a canvas font string can't
// reference a CSS custom property. IBM Plex Mono is the family actually
// loaded via next/font in layout.tsx; Courier Prime is listed first to match
// the token's declared stack but isn't bundled, so browsers fall through to
// Plex Mono in practice.
const GLYPH_FONT_FAMILY = "'Courier Prime', 'IBM Plex Mono', ui-monospace, monospace";
const TIER0_PX_PER_TILE = 8;

// Below Tier 3 (28px/cell) the ledger grid lines would be too cramped to draw,
// but the glyphs themselves stay legible well below that. Keep drawing them in
// Tier 2 down to this cell size so zooming out doesn't turn every word into an
// unreadable colored bar - it just shrinks the letters until they're genuinely
// too small, then falls back to the density blocks.
const TIER2_GLYPH_MIN_PX = 11;

// Down to this cell size, still draw the ledger grid lines so a zoomed-out
// view never reads as blank parchment ("the grid is gone"). Below it, the
// hairlines would be too dense, and Tier 1's density blocks take over.
const TIER2_GRID_MIN_PX = 6;

/** Light full-span ledger hairlines across the visible range (cheap: one path). */
function drawGridLines(
  ctx: CanvasRenderingContext2D,
  vp: ViewportState,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): void {
  ctx.save();
  ctx.strokeStyle = GRIDLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const top = (minY - vp.originY) * vp.scale;
  const bottom = (maxY + 1 - vp.originY) * vp.scale;
  for (let x = minX; x <= maxX + 1; x++) {
    const sx = Math.round((x - vp.originX) * vp.scale) + 0.5;
    ctx.moveTo(sx, top);
    ctx.lineTo(sx, bottom);
  }
  const left = (minX - vp.originX) * vp.scale;
  const right = (maxX + 1 - vp.originX) * vp.scale;
  for (let y = minY; y <= maxY + 1; y++) {
    const sy = Math.round((y - vp.originY) * vp.scale) + 0.5;
    ctx.moveTo(left, sy);
    ctx.lineTo(right, sy);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Maps a tile's sold count to the density value fed to tileDensityColor, with
 * a visible floor: a single sold cell in a 2,500-cell tile would otherwise
 * tint only ~4% (indistinguishable from parchment at far zoom). Any non-empty
 * tile now reads at >=12%.
 */
function displayDensity(soldCount: number): number {
  if (soldCount <= 0) return 0;
  const raw = Math.min(1, soldCount / CELLS_PER_TILE);
  return 0.12 + 0.88 * raw;
}

/**
 * Strokes a frame around the whole grid so its extent is legible against the
 * page background at far zoom (tiers 0/1), where there are no per-cell lines.
 */
function drawGridFrame(ctx: CanvasRenderingContext2D, vp: ViewportState): void {
  const tl = cellToScreen(vp, 0, 0);
  const br = cellToScreen(vp, GRID_SIZE, GRID_SIZE);
  ctx.strokeStyle = INK_MUTED;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tl.x + 0.75, tl.y + 0.75, br.x - tl.x - 1.5, br.y - tl.y - 1.5);
}

export interface Renderer {
  start: () => void;
  stop: () => void;
  markDirty: () => void;
  resize: (width: number, height: number, dpr: number) => void;
  /** Keyboard focus cell to highlight, or null to clear it (e.g. on blur). */
  setFocusCell: (cell: CellPoint | null) => void;
}

/**
 * A double focus ring (parchment halo + ink core) drawn around the keyboard
 * focus cell so it stays visible over any cell background. Distinct from the
 * red in-cart selection outline.
 */
function drawFocusRing(ctx: CanvasRenderingContext2D, vp: ViewportState, cell: CellPoint): void {
  const topLeft = cellToScreen(vp, cell.x, cell.y);
  const size = vp.scale;
  ctx.save();
  ctx.strokeStyle = PARCHMENT;
  ctx.lineWidth = 4;
  ctx.strokeRect(topLeft.x + 1, topLeft.y + 1, size - 2, size - 2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x + 1, topLeft.y + 1, size - 2, size - 2);
  ctx.restore();
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  vp: ViewportState,
  store: TileDataStore
): Renderer {
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("Canvas 2D context unavailable");
  // Re-typed as a fresh non-nullable const: TypeScript's control-flow
  // narrowing above doesn't survive into the nested function declarations
  // below (a well-known closure-narrowing limitation), so `ctx` needs a
  // declared type that's non-null on its own rather than a narrowed union.
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let dirty = true;
  let rafId: number | null = null;
  let tier0Bitmap: HTMLCanvasElement | null = null;
  let tier0BitmapVersion = -1;
  let focusCell: CellPoint | null = null;

  function markDirty() {
    dirty = true;
  }

  function setFocusCell(cell: CellPoint | null) {
    focusCell = cell;
    dirty = true;
  }

  const unsubscribeSelection = selectionStore.subscribe(markDirty);

  function resize(width: number, height: number, dpr: number) {
    vp.width = width;
    vp.height = height;
    vp.dpr = dpr;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    // Keep scale/origin valid after a size change - a resize otherwise leaves
    // a stale scale computed from the old dimensions.
    clampViewport(vp);
    markDirty();
  }

  function draw() {
    ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    ctx.fillStyle = PARCHMENT;
    ctx.fillRect(0, 0, vp.width, vp.height);

    const tier = lodTierForScale(vp.scale);
    if (tier === 0) {
      drawTier0(ctx, vp, store);
    } else if (tier === 1) {
      drawTier1(ctx, vp, store);
    } else if (tier === 2) {
      drawTier2(ctx, vp, store);
    } else {
      drawTier3(ctx, vp, store);
    }

    // Keyboard focus ring on top, only where individual cells are legible.
    if (focusCell && tier >= 2) {
      drawFocusRing(ctx, vp, focusCell);
    }
  }

  function frame() {
    rafId = requestAnimationFrame(frame);
    if (!dirty) return;
    dirty = false;
    draw();
  }

  function start() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    unsubscribeSelection();
  }

  function drawTier0(ctx: CanvasRenderingContext2D, vp: ViewportState, store: TileDataStore) {
    if (!tier0Bitmap || tier0BitmapVersion !== store.summaryVersion) {
      tier0Bitmap = buildTier0Bitmap(store);
      tier0BitmapVersion = store.summaryVersion;
    }
    const topLeft = cellToScreen(vp, 0, 0);
    const bottomRight = cellToScreen(vp, GRID_SIZE, GRID_SIZE);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      tier0Bitmap,
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y
    );
    drawGridFrame(ctx, vp);
  }

  return { start, stop, markDirty, resize, setFocusCell };
}

function buildTier0Bitmap(store: TileDataStore): HTMLCanvasElement {
  const size = TILES_PER_ROW * TIER0_PX_PER_TILE;
  const off = document.createElement("canvas");
  off.width = size;
  off.height = size;
  const octx = off.getContext("2d");
  if (!octx) return off;

  octx.fillStyle = PARCHMENT;
  octx.fillRect(0, 0, size, size);
  for (let ty = 0; ty < TILES_PER_ROW; ty++) {
    for (let tx = 0; tx < TILES_PER_ROW; tx++) {
      const summary = store.tileSummaries.get(tileKey(tx, ty));
      const density = displayDensity(summary ? summary.soldCount : 0);
      octx.fillStyle = tileDensityColor(density);
      octx.fillRect(tx * TIER0_PX_PER_TILE, ty * TIER0_PX_PER_TILE, TIER0_PX_PER_TILE, TIER0_PX_PER_TILE);
    }
  }
  return off;
}

/** Tier 1 (2–10 px/cell): one solid rect per 50x50 tile, colored by sold density. */
function drawTier1(ctx: CanvasRenderingContext2D, vp: ViewportState, store: TileDataStore) {
  const tiles = tilesInViewport(visibleCellBounds(vp));
  for (const t of tiles) {
    const tb = tileBounds(t.tx, t.ty);
    const topLeft = cellToScreen(vp, tb.minX, tb.minY);
    const bottomRight = cellToScreen(vp, tb.maxX + 1, tb.maxY + 1);
    const summary = store.tileSummaries.get(tileKey(t.tx, t.ty));
    const density = displayDensity(summary ? summary.soldCount : 0);
    ctx.fillStyle = tileDensityColor(density);
    ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  }
  drawGridFrame(ctx, vp);
}

/** Tier 2 (10–28 px/cell): per-cell color rects, plus glyphs while cells stay
 *  legible (>= TIER2_GLYPH_MIN_PX) so words remain readable on zoom-out. No
 *  ledger grid lines yet - those arrive with the full Tier 3 grid. */
function drawTier2(ctx: CanvasRenderingContext2D, vp: ViewportState, store: TileDataStore) {
  const { minX, minY, maxX, maxY } = clampedVisibleCells(vp);
  const size = vp.scale;

  // Ledger grid first, so filled cells sit on top of it.
  if (size >= TIER2_GRID_MIN_PX) {
    drawGridLines(ctx, vp, minX, minY, maxX, maxY);
  }

  const showGlyphs = size >= TIER2_GLYPH_MIN_PX;
  if (showGlyphs) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.floor(size * 0.62)}px ${GLYPH_FONT_FAMILY}`;
  }

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const topLeft = cellToScreen(vp, x, y);

      let bg: string;
      let character: string | null;
      if (selectionStore.has(x, y)) {
        bg = getCellColorById(selectionStore.getCellColorId(x, y)).bg;
        character = selectionStore.getCharacter(x, y) ?? null;
      } else {
        const cell = store.getCell(x, y);
        if (!cell || cell.status === "available") continue; // background is already parchment
        bg = cell.status === "sold" ? cell.backgroundColor ?? SOLD_FILL : INK_MUTED;
        character = cell.status === "sold" ? cell.character : null;
      }

      ctx.fillStyle = bg;
      ctx.fillRect(topLeft.x, topLeft.y, size, size);

      if (showGlyphs && character) {
        ctx.fillStyle = contrastGlyphColor(bg);
        ctx.fillText(character, topLeft.x + size / 2, topLeft.y + size / 2 + size * 0.02);
      }
    }
  }
}

/** Tier 3 (>=28 px/cell): full ledger grid, glyphs, and the only tier where selection is active. */
function drawTier3(ctx: CanvasRenderingContext2D, vp: ViewportState, store: TileDataStore) {
  const { minX, minY, maxX, maxY } = clampedVisibleCells(vp);
  const size = vp.scale;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.floor(size * 0.62)}px ${GLYPH_FONT_FAMILY}`;
  ctx.lineWidth = 1;
  ctx.strokeStyle = GRIDLINE;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const topLeft = cellToScreen(vp, x, y);
      const selected = selectionStore.has(x, y);
      const cell = store.getCell(x, y);
      const status = selected ? "selected" : (cell?.status ?? "available");

      if (status === "selected") {
        const bg = getCellColorById(selectionStore.getCellColorId(x, y)).bg;
        ctx.fillStyle = bg;
        ctx.fillRect(topLeft.x, topLeft.y, size, size);
        const ch = selectionStore.getCharacter(x, y);
        if (ch) {
          ctx.fillStyle = contrastGlyphColor(bg);
          ctx.fillText(ch, topLeft.x + size / 2, topLeft.y + size / 2 + size * 0.02);
        }
      } else if (status === "sold") {
        const bg = cell?.backgroundColor ?? SOLD_FILL;
        ctx.fillStyle = bg;
        ctx.fillRect(topLeft.x, topLeft.y, size, size);
        if (cell?.character) {
          ctx.fillStyle = contrastGlyphColor(bg);
          ctx.fillText(cell.character, topLeft.x + size / 2, topLeft.y + size / 2 + size * 0.02);
        }
      } else if (status === "reserved") {
        drawHatch(ctx, topLeft.x, topLeft.y, size);
      }
      // available cells: no fill - just the hairline grid stroked below.

      ctx.strokeRect(topLeft.x + 0.5, topLeft.y + 0.5, size - 1, size - 1);

      // In-cart cells get a thin red outline so they read as "yours, not yet
      // paid" regardless of the chosen background color.
      if (status === "selected") {
        ctx.save();
        ctx.strokeStyle = SELECTION_OUTLINE;
        ctx.lineWidth = Math.max(1.5, size * 0.06);
        ctx.strokeRect(topLeft.x + 1, topLeft.y + 1, size - 2, size - 2);
        ctx.restore();
      }
    }
  }
}

function drawHatch(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  ctx.strokeStyle = INK_MUTED;
  ctx.lineWidth = Math.max(1, size * 0.05);
  const step = Math.max(4, size / 4);
  for (let offset = -size; offset < size * 2; offset += step) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + offset + size, y + size);
    ctx.stroke();
  }
  ctx.restore();
}

function clampedVisibleCells(vp: ViewportState) {
  const bounds = visibleCellBounds(vp);
  return {
    minX: Math.max(0, Math.floor(bounds.minX)),
    minY: Math.max(0, Math.floor(bounds.minY)),
    maxX: Math.min(GRID_SIZE - 1, Math.ceil(bounds.maxX)),
    maxY: Math.min(GRID_SIZE - 1, Math.ceil(bounds.maxY)),
  };
}
