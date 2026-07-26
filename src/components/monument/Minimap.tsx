"use client";

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { GRID_SIZE, TILE_SIZE } from "@/lib/config";
import { selectionStore } from "@/lib/monument/selection-store";
import { PARCHMENT, INK, STAMP_RED, INK_MUTED } from "./canvas/palette";
import { CELLS_PER_TILE, type TileDataStore } from "./canvas/tiles";
import { visibleCellBounds, type ViewportState } from "./canvas/viewport";

// A small "you are here" overview of the whole 1,000,000-cell grid: sold-cell
// density, a red ring marking where the inscriptions live, and a rectangle for
// the current viewport. Click or drag it to jump the main view there. Runs its
// own lightweight rAF that only repaints when the viewport or data changed, so
// it stays in sync during a pan/zoom without ever forcing a React re-render.

const MAP_SIZE = 150; // logical px; the grid is square so the map is too.
const TILES_PER_AXIS = GRID_SIZE / TILE_SIZE; // 20
const TILE_PX = MAP_SIZE / TILES_PER_AXIS; // 7.5

interface MinimapProps {
  vpRef: RefObject<ViewportState | null>;
  storeRef: RefObject<TileDataStore | null>;
  onJump: (cellX: number, cellY: number) => void;
}

function clampCell(v: number): number {
  return Math.max(0, Math.min(GRID_SIZE - 1, Math.round(v)));
}

function clampPx(v: number): number {
  return Math.max(0, Math.min(MAP_SIZE, v));
}

function render(ctx: CanvasRenderingContext2D, vp: ViewportState | null, store: TileDataStore | null): void {
  ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
  ctx.fillStyle = PARCHMENT;
  ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

  if (store) {
    // Sold-cell density: darker tiles hold more inscriptions.
    for (const [key, summary] of store.tileSummaries) {
      if (summary.soldCount <= 0) continue;
      const comma = key.indexOf(",");
      const tx = Number(key.slice(0, comma));
      const ty = Number(key.slice(comma + 1));
      const density = Math.min(1, summary.soldCount / CELLS_PER_TILE);
      ctx.globalAlpha = 0.4 + 0.55 * density; // floor keeps a single sold cell visible
      ctx.fillStyle = INK;
      ctx.fillRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
    }
    ctx.globalAlpha = 1;

    // A red ring around where the words actually are, so "the content" is
    // always findable no matter how far you've wandered.
    const b = store.contentBounds();
    if (b) {
      const x = (b.minX / GRID_SIZE) * MAP_SIZE;
      const y = (b.minY / GRID_SIZE) * MAP_SIZE;
      const w = ((b.maxX - b.minX + 1) / GRID_SIZE) * MAP_SIZE;
      const h = ((b.maxY - b.minY + 1) / GRID_SIZE) * MAP_SIZE;
      ctx.strokeStyle = STAMP_RED;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
    }
  }

  // The current viewport: "you are here".
  if (vp) {
    const vb = visibleCellBounds(vp);
    const x = clampPx((vb.minX / GRID_SIZE) * MAP_SIZE);
    const y = clampPx((vb.minY / GRID_SIZE) * MAP_SIZE);
    const w = Math.max(3, clampPx((vb.maxX / GRID_SIZE) * MAP_SIZE) - x);
    const h = Math.max(3, clampPx((vb.maxY / GRID_SIZE) * MAP_SIZE) - y);
    ctx.fillStyle = "rgba(26, 23, 16, 0.10)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
  }

  // Inner frame.
  ctx.strokeStyle = INK_MUTED;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, MAP_SIZE - 1, MAP_SIZE - 1);
}

export default function Minimap({ vpRef, storeRef, onJump }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const draggingRef = useRef(false);

  // When a cart exists, the bottom selection tray covers this corner on a narrow
  // phone screen, so hide the minimap on mobile while the tray is up (it stays
  // on desktop, where the tray is a centered strip that doesn't overlap).
  const hasSelection = useSyncExternalStore(
    selectionStore.subscribe,
    () => selectionStore.getSnapshot().size > 0,
    () => false,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = MAP_SIZE * dpr;
    canvas.height = MAP_SIZE * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    let lastSig = "";

    const tick = () => {
      const vp = vpRef.current;
      const store = storeRef.current;
      const sig = vp
        ? `${Math.round(vp.originX)}:${Math.round(vp.originY)}:${vp.scale.toFixed(2)}:${vp.width}:${vp.height}:${store?.tileSummaries.size ?? 0}:${store?.cellCache.size ?? 0}`
        : "empty";
      if (sig !== lastSig) {
        lastSig = sig;
        render(ctx, vp, store);
        if (labelRef.current && vp) {
          const cx = clampCell(vp.originX + vp.width / vp.scale / 2);
          const cy = clampCell(vp.originY + vp.height / vp.scale / 2);
          labelRef.current.textContent = `${cx} · ${cy}`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [vpRef, storeRef]);

  const jumpFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    onJump(clampCell(fx * GRID_SIZE), clampCell(fy * GRID_SIZE));
  };

  return (
    <div
      className={`pointer-events-auto absolute bottom-3 right-3 z-20 select-none border border-ink bg-parchment-card sm:bottom-6 sm:right-6 ${
        hasSelection ? "hidden sm:block" : ""
      }`}
    >
      <div className="flex items-center justify-center gap-3 border-b border-rule px-2 py-1 sm:justify-between">
        <span className="hidden font-mono-grid text-[10px] uppercase tracking-[0.18em] text-ink-60 sm:inline">
          You are here
        </span>
        <span ref={labelRef} className="font-mono-grid text-[10px] tabular-nums tracking-[0.1em] text-ink" />
      </div>
      <canvas
        ref={canvasRef}
        className="block h-[112px] w-[112px] cursor-crosshair touch-none sm:h-[150px] sm:w-[150px]"
        aria-label="Monument minimap. The red mark is where the inscriptions are; the box is your current view. Click to jump there."
        onPointerDown={(e) => {
          draggingRef.current = true;
          jumpFromEvent(e);
          // Capture so a drag keeps scrubbing even off the canvas; guard because
          // setPointerCapture throws on an already-released/invalid pointer id.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) jumpFromEvent(e);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {}
        }}
      />
    </div>
  );
}
