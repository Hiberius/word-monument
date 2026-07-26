"use client";

// Visible map-style zoom affordance. Pan/zoom already works via wheel/drag/
// pinch gestures, but gesture-only interaction isn't discoverable on first
// contact - a real map always shows +/- controls even though scroll-zoom
// also works, and this grid should read the same way.

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export default function ZoomControls({ onZoomIn, onZoomOut, onFit }: ZoomControlsProps) {
  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-20 flex flex-col border border-ink bg-parchment-card sm:right-6 sm:top-6">
      <button
        type="button"
        onClick={onZoomIn}
        aria-label="Zoom in"
        className="flex h-10 w-10 items-center justify-center border-b border-rule font-mono-grid text-lg text-ink transition-colors hover:bg-stamp-red hover:text-parchment focus-visible:bg-stamp-red focus-visible:text-parchment focus-visible:outline-none"
      >
        +
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        aria-label="Zoom out"
        className="flex h-10 w-10 items-center justify-center border-b border-rule font-mono-grid text-lg text-ink transition-colors hover:bg-stamp-red hover:text-parchment focus-visible:bg-stamp-red focus-visible:text-parchment focus-visible:outline-none"
      >
        &minus;
      </button>
      <button
        type="button"
        onClick={onFit}
        aria-label="Reset to full grid view"
        className="flex h-10 w-10 items-center justify-center font-mono-grid text-xs uppercase text-ink transition-colors hover:bg-stamp-red hover:text-parchment focus-visible:bg-stamp-red focus-visible:text-parchment focus-visible:outline-none"
      >
        Fit
      </button>
    </div>
  );
}
