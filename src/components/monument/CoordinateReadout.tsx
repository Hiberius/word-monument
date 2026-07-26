"use client";

// HTML (not canvas) overlay: the live x/y registry index under the cursor or
// touch point, shown only at the maximum LOD tier. Positioned via the same
// viewport transform math the character-entry overlay uses.

interface CoordinateReadoutProps {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
}

export default function CoordinateReadout({ x, y, screenX, screenY }: CoordinateReadoutProps) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 translate-y-4 whitespace-nowrap border border-rule bg-parchment px-2 py-0.5 font-mono-grid text-xs tracking-wide text-ink"
      style={{ left: screenX, top: screenY }}
    >
      {String(x).padStart(4, "0")}, {String(y).padStart(4, "0")}
    </div>
  );
}
