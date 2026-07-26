import { panBy, screenToCell, zoomAt, type ViewportState } from "./viewport";

const TAP_MAX_MOVEMENT_PX = 6;
const TAP_MAX_DURATION_MS = 400;
const SETTLE_DELAY_MS = 200;
const WHEEL_ZOOM_SPEED = 0.0015;

/** Wheel deltas come in three different units depending on the browser: Chrome
 *  reports pixels (~100 per notch), Firefox reports LINES (~3 per notch) and a
 *  few setups report pages. Reading deltaY raw makes one Firefox notch worth
 *  about a thirtieth of a Chrome one, so everything is converted to pixels
 *  before WHEEL_ZOOM_SPEED (tuned against the pixel unit) is applied. */
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;
const WHEEL_LINE_PX = 16;

/** Trackpad momentum can deliver a single delta worth several notches; capping
 *  the normalized value keeps one event from flinging the zoom across tiers. */
const WHEEL_MAX_DELTA_PX = 120;

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface GestureCallbacks {
  /** Called synchronously on every pan/zoom tick - mark the renderer dirty here, no React state. */
  onViewportChange: () => void;
  /** Called ~200ms after panning/zooming goes quiet - trigger tile data fetch here. */
  onSettle: () => void;
  /** A plain click/tap without drag - cell coords are floored (i.e. the cell under the point). */
  onTap: (cell: { x: number; y: number }, screen: ScreenPoint) => void;
  /** Pointer position for the coordinate readout; null on leave. */
  onPointerMove?: (screen: ScreenPoint | null) => void;
  /** CSS cursor for a hover (no buttons pressed) at this position. Lets the
   *  host show a pointer over selectable cells and a crosshair in move mode,
   *  instead of the flat grab hand everywhere. Falls back to "grab". */
  getHoverCursor?: (screen: ScreenPoint) => string;
}

interface PointerRecord {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
}

/**
 * Unifies mouse + touch via Pointer Events: one pointer drags to pan, two
 * pointers pinch-zoom anchored at their midpoint, and a short low-movement
 * press/click is treated as a tap. Wheel (including trackpad pinch, which
 * arrives as wheel events with ctrlKey set) always zooms, anchored at the
 * cursor. Returns a cleanup function.
 */
export function attachGestures(
  canvas: HTMLCanvasElement,
  vp: ViewportState,
  callbacks: GestureCallbacks
): () => void {
  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";

  const pointers = new Map<number, PointerRecord>();
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let pinchStartDist = 0;
  let pinchStartScale = 0;

  function scheduleSettle() {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      callbacks.onSettle();
    }, SETTLE_DELAY_MS);
  }

  function getPos(e: PointerEvent): ScreenPoint {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = Math.exp(-normalizeWheelDelta(e, vp.height) * WHEEL_ZOOM_SPEED);
    zoomAt(vp, sx, sy, factor);
    callbacks.onViewportChange();
    scheduleSettle();
  }

  function handlePointerDown(e: PointerEvent) {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture unsupported - dragging still works via document-level move/up
    }
    const { x, y } = getPos(e);
    pointers.set(e.pointerId, { x, y, startX: x, startY: y, startTime: performance.now() });
    canvas.style.cursor = "grabbing";

    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      pinchStartDist = distance(a, b);
      pinchStartScale = vp.scale;
    }
  }

  function handlePointerMove(e: PointerEvent) {
    const record = pointers.get(e.pointerId);
    if (!record) {
      const pos = getPos(e);
      canvas.style.cursor = callbacks.getHoverCursor?.(pos) ?? "grab";
      callbacks.onPointerMove?.(pos);
      return;
    }

    const pos = getPos(e);

    if (pointers.size === 2) {
      pointers.set(e.pointerId, { ...record, x: pos.x, y: pos.y });
      const [a, b] = Array.from(pointers.values());
      const dist = distance(a, b);
      const mid = midpoint(a, b);
      if (pinchStartDist > 0) {
        vp.scale = pinchStartScale;
        zoomAt(vp, mid.x, mid.y, dist / pinchStartDist);
      }
      callbacks.onViewportChange();
      scheduleSettle();
      return;
    }

    if (pointers.size === 1) {
      const dx = pos.x - record.x;
      const dy = pos.y - record.y;
      pointers.set(e.pointerId, { ...record, x: pos.x, y: pos.y });
      panBy(vp, dx, dy);
      callbacks.onViewportChange();
      callbacks.onPointerMove?.(pos);
      scheduleSettle();
    }
  }

  function handlePointerUp(e: PointerEvent) {
    const record = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      canvas.style.cursor = callbacks.getHoverCursor?.(getPos(e)) ?? "grab";
    }
    try {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    } catch {
      // no-op - capture may already have been released by the browser
    }

    pinchStartDist = 0;
    if (pointers.size === 1) {
      // Coming out of a pinch back to a single-pointer drag: reset the tap
      // baseline for the remaining pointer so a lifted pinch never reads as a tap.
      const [id, remaining] = Array.from(pointers.entries())[0];
      pointers.set(id, {
        ...remaining,
        startX: remaining.x,
        startY: remaining.y,
        startTime: performance.now(),
      });
    }

    if (record) {
      const pos = getPos(e);
      const moved = distance(pos, { x: record.startX, y: record.startY });
      const duration = performance.now() - record.startTime;
      if (moved <= TAP_MAX_MOVEMENT_PX && duration <= TAP_MAX_DURATION_MS) {
        const cell = screenToCell(vp, pos.x, pos.y);
        callbacks.onTap({ x: Math.floor(cell.x), y: Math.floor(cell.y) }, pos);
      }
    }
  }

  function handlePointerLeave() {
    callbacks.onPointerMove?.(null);
  }

  canvas.addEventListener("wheel", handleWheel, { passive: false });
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
  canvas.addEventListener("pointerleave", handlePointerLeave);

  return () => {
    if (settleTimer) clearTimeout(settleTimer);
    canvas.removeEventListener("wheel", handleWheel);
    canvas.removeEventListener("pointerdown", handlePointerDown);
    canvas.removeEventListener("pointermove", handlePointerMove);
    canvas.removeEventListener("pointerup", handlePointerUp);
    canvas.removeEventListener("pointercancel", handlePointerUp);
    canvas.removeEventListener("pointerleave", handlePointerLeave);
  };
}

/** deltaY expressed in pixels whatever unit the browser reported it in, capped
 *  so a burst of trackpad inertia can't overshoot. */
function normalizeWheelDelta(e: WheelEvent, pageHeightPx: number): number {
  let delta = e.deltaY;
  if (e.deltaMode === DOM_DELTA_LINE) delta *= WHEEL_LINE_PX;
  else if (e.deltaMode === DOM_DELTA_PAGE) delta *= pageHeightPx;
  return Math.max(-WHEEL_MAX_DELTA_PX, Math.min(WHEEL_MAX_DELTA_PX, delta));
}

function distance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
