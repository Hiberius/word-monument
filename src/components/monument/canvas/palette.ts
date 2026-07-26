// Civic Ledger palette, duplicated here as plain hex/rgb strings for Canvas 2D
// fillStyle/strokeStyle use. The authoritative tokens live in src/styles/tokens.css
// (owned by another agent) - a canvas fillStyle needs a literal color value, not a
// CSS custom property, so these constants intentionally mirror those tokens rather
// than reading them.

export const PARCHMENT = "#F6F1E7";
export const INK = "#1A1710";
export const STAMP_RED = "#B23A2E";

/** Muted ink-ish tone for cells reserved by someone else - deliberately not red. */
export const INK_MUTED = "#8A8371";

/** Thin ink hairline for the per-cell grid at Tier 3 - a clean dark line,
 * not the old red dashed outline. Only visible on empty (parchment) cells. */
export const GRIDLINE = "rgba(26, 23, 16, 0.16)";

export const SOLD_FILL = INK;
/** Thin red outline marking a cell as in-cart (selected but not yet paid). */
export const SELECTION_OUTLINE = STAMP_RED;

/** Glyph color for a given cell background: ink on light, parchment on dark. */
export function contrastGlyphColor(bgHex: string): string {
  const { r, g, b } = hexToRgb(bgHex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? INK : PARCHMENT;
}

/**
 * LOD tier thresholds, in pixels-per-cell. A scale below TIER_1 is Tier 0
 * (coarse cached bitmap), below TIER_2 is Tier 1 (tile blocks), below TIER_3
 * is Tier 2 (per-cell rects, no glyphs), and at/above TIER_3 is Tier 3 (full
 * ledger grid + glyphs + interaction).
 */
export const LOD_TIER_1_MIN_PX_PER_CELL = 2;
export const LOD_TIER_2_MIN_PX_PER_CELL = 10;
export const LOD_TIER_3_MIN_PX_PER_CELL = 28;

/** Fixed navigation depth cap - text stays crisp at any zoom since it's vector fillText. */
export const MAX_PX_PER_CELL = 64;

/**
 * Interpolates parchment -> stamp-red -> ink as a tile's sold density rises,
 * so Tier 0/1 reads as a heat map of monument completion from a distance.
 */
export function tileDensityColor(soldFraction: number): string {
  const t = Math.min(1, Math.max(0, soldFraction));
  if (t <= 0) return PARCHMENT;
  if (t < 0.5) return mixHex(PARCHMENT, STAMP_RED, t / 0.5);
  return mixHex(STAMP_RED, INK, (t - 0.5) / 0.5);
}

function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}
