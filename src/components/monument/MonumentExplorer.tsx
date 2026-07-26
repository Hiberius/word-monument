"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GRID_SIZE, MAX_CELLS_PER_TX, TILE_SIZE } from "@/lib/config";
import { ALLOWED_PUNCTUATION, CURATED_EMOJI, validateCharacter } from "@/lib/moderation/charset";
import { CELL_COLORS } from "@/lib/monument/colors";
import { selectionStore } from "@/lib/monument/selection-store";
import { tileKey, tilesInViewport } from "@/lib/monument/tile-math";
import { attachGestures } from "./canvas/gestures";
import { createRenderer, type Renderer } from "./canvas/renderer";
import { TileDataStore } from "./canvas/tiles";
import {
  cellToScreen,
  centerViewportOn,
  clampViewport,
  createViewport,
  DEFAULT_PX_PER_CELL,
  fitScaleForBounds,
  fitViewportToBounds,
  lodTierForScale,
  screenToCell,
  visibleCellBounds,
  zoomAt,
  type CellPoint,
  type ViewportState,
} from "./canvas/viewport";
import CoordinateReadout from "./CoordinateReadout";
import Minimap from "./Minimap";
import SelectionTray from "./SelectionTray";
import ZoomControls from "./ZoomControls";

/** Button-triggered zoom step, roughly one comfortable "click" of zoom. */
const BUTTON_ZOOM_FACTOR = 1.6;

/** One tile of prefetch margin around the viewport, per the tiled-fetch contract. */
const TILE_FETCH_MARGIN_CELLS = TILE_SIZE;

/** Quick-pick characters shown in the inline editor for keyboards that make emoji/punctuation awkward to type. */
const QUICK_PICK_CHARS = [...ALLOWED_PUNCTUATION, ...CURATED_EMOJI];

const GRID_CENTER: CellPoint = { x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) };

/** Breathing room around the content when fitting, in cells. Kept small so a
 *  short inscription fits at a legible (glyph) scale rather than a hair below it. */
const FIT_PADDING_CELLS = 10;

/** Larger margin for the zoom-OUT floor: you can zoom out past FIT for context,
 *  but never into the empty void. Kept bigger than FIT_PADDING so the "−" button
 *  still works after pressing FIT. */
const ZOOM_OUT_PADDING_CELLS = 30;

/** Hard floor for the zoom-OUT scale, in px/cell. Below ~10px the renderer drops
 *  to the Tier-1 density view (faint colored tiles, no gridlines, no glyphs),
 *  which on a mostly-empty grid reads as a broken blank expanse. Clamp the
 *  zoom-out floor to a scale where the grid still renders as a grid and the
 *  words stay readable, so zooming all the way out can never land on emptiness.
 *  Just above TIER2_GLYPH_MIN_PX (11) in the renderer. */
const MIN_ZOOM_OUT_PX_PER_CELL = 12;

/** Half the inline editor popup's width/height. The popup is centered on the
 *  cell (-translate-1/2), so these keep it fully on-screen when the edited cell
 *  sits near a grid edge, which is what breaks it on a narrow mobile viewport. */
const EDITOR_POPUP_HALF_W = 122;
const EDITOR_POPUP_HALF_H = 150;

/** Keeps a centered popup coordinate inside the container (margin from edges).
 *  Centers it when the container is too small to hold it with margins. */
function clampPopupCoord(value: number, halfSize: number, containerSize: number | undefined): number {
  if (!containerSize) return value;
  const margin = 8;
  const min = halfSize + margin;
  const max = containerSize - halfSize - margin;
  if (max <= min) return containerSize / 2;
  return Math.min(Math.max(value, min), max);
}

/** Height of the selection tray currently overlapping the bottom of the canvas.
 *  On a phone it covers close to half the grid, so centering on the geometric
 *  middle would hide the buyer's own words underneath it. Measured rather than
 *  guessed because the tray grows with the number of selected cells. */
function trayInsetPx(container: HTMLElement | null): number {
  if (!container) return 0;
  const tray = container.querySelector("[data-selection-tray]");
  if (!(tray instanceof HTMLElement)) return 0;
  const containerBottom = container.getBoundingClientRect().bottom;
  const trayTop = tray.getBoundingClientRect().top;
  return Math.max(0, Math.round(containerBottom - trayTop));
}

/** Bounding-box center of the current cart, or null when it's empty. Lets the
 *  explorer open centered on a word just placed via the homepage calculator. */
function selectionCentroid(): CellPoint | null {
  const cells = selectionStore.getSnapshot();
  if (cells.size === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const key of cells.keys()) {
    const comma = key.indexOf(",");
    const x = Number(key.slice(0, comma));
    const y = Number(key.slice(comma + 1));
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: Math.round((minX + maxX) / 2), y: Math.round((minY + maxY) / 2) };
}

interface EditorState {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  initialCharacter: string;
  colorId: string;
}

interface PointerReadout {
  screenX: number;
  screenY: number;
  cellX: number;
  cellY: number;
}

export default function MonumentExplorer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const vpRef = useRef<ViewportState | null>(null);
  const storeRef = useRef<TileDataStore | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  // Until the visitor pans/zooms, the opening view stays pinned to the grid's
  // heart (the founding inscription). This also self-heals the case where the
  // container measures 0×0 at mount (inside the dynamic import it can lay out
  // a frame late) so the first real ResizeObserver callback recenters instead
  // of leaving the center cell stuck in the top-left corner.
  const hasInteractedRef = useRef(false);
  // True when the pending canvas focus was triggered by a mouse/touch press
  // rather than the keyboard. Focus from a pointer must NOT change the zoom;
  // only keyboard focus (Tab) brings the view to a legible tier.
  const focusFromPointerRef = useRef(false);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pointer, setPointer] = useState<PointerReadout | null>(null);
  const [tier, setTier] = useState(0);
  // Reposition mode: a tap moves the WHOLE cart to that spot instead of
  // opening the cell editor. Mirrored into a ref because the gesture/keyboard
  // handlers live outside React's render cycle.
  const [moveMode, setMoveMode] = useState(false);
  const moveModeRef = useRef(false);
  const [moveNotice, setMoveNotice] = useState<string | null>(null);
  // Keyboard focus cell (a11y): navigable with arrows, editable with Enter.
  // Lives in a ref so pan/zoom never re-renders; the renderer draws its ring.
  const focusRef = useRef({ x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) });
  const [announcement, setAnnouncement] = useState("");

  /**
   * Drops cart cells the server has since claimed. A cell in the cart always
   * draws as "yours", so a cell sold or reserved by someone else while it sat
   * there would keep showing the buyer's own glyph until checkout came back
   * 409. Runs whenever fresh tile data lands, which is the only moment we can
   * learn about it.
   */
  const reconcileCartWithTiles = useCallback(() => {
    const store = storeRef.current;
    if (!store) return;
    const snapshot = selectionStore.getSnapshot();
    if (snapshot.size === 0) return;
    let dropped = 0;
    for (const key of Array.from(snapshot.keys())) {
      const comma = key.indexOf(",");
      const x = Number(key.slice(0, comma));
      const y = Number(key.slice(comma + 1));
      // Only SOLD cells are dropped, never merely 'reserved' ones. cells_public
      // deliberately withholds reservation_id, so a reserved cell is
      // indistinguishable from THIS buyer's own in-flight hold: they reserve,
      // go to /checkout, come back to the grid, and their own cells would be
      // torn out of the cart with a message saying a stranger took them, while
      // their Stripe session is still live. A sold cell is unambiguous: the
      // buyer's own purchase clears the cart on /success.
      const serverCell = store.getCell(x, y);
      if (serverCell && serverCell.status === "sold") {
        selectionStore.remove(x, y);
        dropped += 1;
      }
    }
    if (dropped === 0) return;
    const notice =
      dropped === 1
        ? "One of your cells was just claimed by someone else and left your selection."
        : `${dropped} of your cells were just claimed by someone else and left your selection.`;
    setAnnouncement(notice);
    // Reposition mode replaces the tray with the move chip, so there the chip
    // is the only place a visible notice can land.
    if (moveModeRef.current) setMoveNotice(notice);
  }, []);

  const fetchVisibleTiles = useCallback(() => {
    const vp = vpRef.current;
    const store = storeRef.current;
    if (!vp || !store) return;
    const bounds = visibleCellBounds(vp, TILE_FETCH_MARGIN_CELLS);
    const tiles = tilesInViewport(bounds);
    store
      .fetchTiles(tiles)
      .catch((err) => console.warn("[MonumentExplorer] fetchTiles rejected", err))
      .finally(() => {
        reconcileCartWithTiles();
        rendererRef.current?.markDirty();
      });
  }, [reconcileCartWithTiles]);

  /**
   * Whether a cache miss at (x, y) can be trusted to mean "free". Inside the
   * region we keep fetching it can: a miss there is a genuinely unclaimed cell.
   * Outside it, only a tile whose summary reports nothing sold is provably
   * empty; anywhere else the cell is simply unknown, and treating unknown as
   * free produces repositions that are doomed at checkout.
   */
  const isUnfetchedCellFree = useCallback((x: number, y: number): boolean => {
    const vp = vpRef.current;
    const store = storeRef.current;
    if (!vp || !store) return false;
    const b = visibleCellBounds(vp, TILE_FETCH_MARGIN_CELLS);
    if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) return true;
    const summary = store.tileSummaries.get(tileKey(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)));
    return summary !== undefined && summary.soldCount === 0;
  }, []);

  /**
   * Moves the whole cart by (dx, dy) if every destination cell is inside the
   * grid and not sold/reserved by someone else. Returns whether it moved.
   */
  const tryTranslateSelection = useCallback((dx: number, dy: number): boolean => {
    const snapshot = selectionStore.getSnapshot();
    if (snapshot.size === 0) return false;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const key of snapshot.keys()) {
      const comma = key.indexOf(",");
      const x = Number(key.slice(0, comma));
      const y = Number(key.slice(comma + 1));
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) {
        setMoveNotice("That would push your words off the grid.");
        return false;
      }
      // A destination is fine if it's free on the server, or currently one of
      // our own cells (the word sliding over itself).
      if (!snapshot.has(`${nx},${ny}`)) {
        const serverCell = storeRef.current?.getCell(nx, ny);
        if (serverCell && serverCell.status !== "available") {
          setMoveNotice("That spot overlaps taken cells. Try another.");
          return false;
        }
        if (!serverCell && !isUnfetchedCellFree(nx, ny)) {
          setMoveNotice("We can't see that spot yet. Pan over there first, then move your words.");
          return false;
        }
      }
    }

    const moved = selectionStore.translateBy(dx, dy);
    if (moved) {
      setMoveNotice(null);
      setAnnouncement("Words moved.");
      // Keep the words on screen: arrow nudges (and taps near an edge) must
      // never push the cart out of the viewport without the view following.
      const vp = vpRef.current;
      if (vp) {
        const cx = Math.round((minX + maxX) / 2) + dx;
        const cy = Math.round((minY + maxY) / 2) + dy;
        // Generous margin: the move chip / tray overlays the bottom rows, so
        // "still technically inside the viewport" can still mean "hidden".
        const b = visibleCellBounds(vp);
        const margin = 5;
        if (cx < b.minX + margin || cx > b.maxX - margin || cy < b.minY + margin || cy > b.maxY - margin) {
          centerViewportOn(vp, cx, cy, trayInsetPx(containerRef.current));
          rendererRef.current?.markDirty();
          setTier(lodTierForScale(vp.scale));
          fetchVisibleTiles();
        }
      }
    }
    return moved;
  }, [fetchVisibleTiles, isUnfetchedCellFree]);

  /** Reposition-mode tap: drop the cart centered on the tapped cell. */
  const handleMoveTap = useCallback(
    (cellX: number, cellY: number) => {
      const snapshot = selectionStore.getSnapshot();
      if (snapshot.size === 0) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const key of snapshot.keys()) {
        const comma = key.indexOf(",");
        const x = Number(key.slice(0, comma));
        const y = Number(key.slice(comma + 1));
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const dx = cellX - Math.round((minX + maxX) / 2);
      const dy = cellY - Math.round((minY + maxY) / 2);
      tryTranslateSelection(dx, dy);
    },
    [tryTranslateSelection],
  );

  const handleTap = useCallback((cellX: number, cellY: number) => {
    const vp = vpRef.current;
    if (!vp) return;
    if (lodTierForScale(vp.scale) < 3) return; // selection only activates at Tier 3+
    if (cellX < 0 || cellY < 0 || cellX >= GRID_SIZE || cellY >= GRID_SIZE) return;

    // A tap is a focus change too: without this the next arrow key snaps the
    // view back to wherever the keyboard focus was last left.
    focusRef.current = { x: cellX, y: cellY };
    rendererRef.current?.setFocusCell(focusRef.current);

    if (moveModeRef.current) {
      handleMoveTap(cellX, cellY);
      return;
    }

    const alreadySelected = selectionStore.has(cellX, cellY);
    if (!alreadySelected) {
      const serverCell = storeRef.current?.getCell(cellX, cellY);
      if (serverCell && serverCell.status !== "available") return; // sold or reserved elsewhere
      // Client-side guard mirroring the per-transaction cap; the reserve_cells_atomic
      // RPC is the authoritative enforcement, this just avoids a doomed request.
      if (selectionStore.getSnapshot().size >= MAX_CELLS_PER_TX) return;
    }

    const screen = cellToScreen(vp, cellX + 0.5, cellY + 0.5);
    setEditor({
      x: cellX,
      y: cellY,
      screenX: screen.x,
      screenY: screen.y,
      initialCharacter: selectionStore.getCharacter(cellX, cellY) ?? "",
      colorId: selectionStore.getCellColorId(cellX, cellY),
    });
  }, [handleMoveTap]);

  // Shared by both gesture handlers and the visible zoom buttons below, so a
  // button click produces exactly the same redraw + tier update + tile
  // refetch a wheel/pinch gesture would.
  const applyViewportChange = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return;
    hasInteractedRef.current = true;
    rendererRef.current?.markDirty();
    setTier(lodTierForScale(vp.scale));
    fetchVisibleTiles();
  }, [fetchVisibleTiles]);

  const handleZoomIn = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return;
    zoomAt(vp, vp.width / 2, vp.height / 2, BUTTON_ZOOM_FACTOR);
    applyViewportChange();
  }, [applyViewportChange]);

  const handleZoomOut = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return;
    zoomAt(vp, vp.width / 2, vp.height / 2, 1 / BUTTON_ZOOM_FACTOR);
    applyViewportChange();
  }, [applyViewportChange]);

  // Recenter the main view on a cell, keeping the current zoom. Used by the
  // minimap so a click on the overview jumps you there.
  const jumpTo = useCallback(
    (cellX: number, cellY: number) => {
      const vp = vpRef.current;
      if (!vp) return;
      centerViewportOn(vp, cellX, cellY);
      applyViewportChange();
    },
    [applyViewportChange],
  );

  const handleFit = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return;
    // Frame where content actually is (placed words), not the whole empty grid.
    // Otherwise "fit" shows a speck in a void. Falls back to a centered view when
    // the grid is empty.
    const bounds = storeRef.current?.contentBounds();
    if (bounds) {
      fitViewportToBounds(vp, bounds, FIT_PADDING_CELLS);
    } else {
      vp.scale = DEFAULT_PX_PER_CELL;
      centerViewportOn(vp, GRID_CENTER.x, GRID_CENTER.y);
    }
    applyViewportChange();
  }, [applyViewportChange]);

  // --- Keyboard accessibility -------------------------------------------------

  const announceCell = useCallback((x: number, y: number) => {
    const cell = storeRef.current?.getCell(x, y);
    let state: string;
    if (selectionStore.has(x, y)) {
      const ch = selectionStore.getCharacter(x, y);
      state = ch ? `in your selection, character ${ch}` : "in your selection, no character yet";
    } else if (cell?.status === "sold") {
      state = cell.character ? `taken, character ${cell.character}` : "taken";
    } else if (cell?.status === "reserved") {
      state = "reserved by someone else";
    } else {
      state = "available";
    }
    setAnnouncement(`Cell ${x}, ${y}. ${state}.`);
  }, []);

  const ensureFocusVisible = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const { x, y } = focusRef.current;
    const b = visibleCellBounds(vp);
    if (x <= b.minX + 1 || x >= b.maxX - 1 || y <= b.minY + 1 || y >= b.maxY - 1) {
      centerViewportOn(vp, x, y, trayInsetPx(containerRef.current));
    }
  }, []);

  const moveFocus = useCallback(
    (dx: number, dy: number) => {
      hasInteractedRef.current = true;
      const x = Math.min(GRID_SIZE - 1, Math.max(0, focusRef.current.x + dx));
      const y = Math.min(GRID_SIZE - 1, Math.max(0, focusRef.current.y + dy));
      focusRef.current = { x, y };
      ensureFocusVisible();
      rendererRef.current?.setFocusCell(focusRef.current);
      applyViewportChange();
      announceCell(x, y);
    },
    [applyViewportChange, announceCell, ensureFocusVisible],
  );

  const handleCanvasFocus = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return;
    // Focus from a mouse/touch press must leave the zoom untouched: a user who
    // zoomed out and then clicks the grid would otherwise be snapped back to the
    // default zoom. Only keyboard focus (Tab) brings the view to a legible tier,
    // since that's when the focus ring and arrow-key navigation must be visible.
    if (focusFromPointerRef.current) {
      focusFromPointerRef.current = false;
      return;
    }
    hasInteractedRef.current = true;
    // Bring the view to a legible tier so the focus ring + cells are visible.
    if (lodTierForScale(vp.scale) < 3) {
      vp.scale = DEFAULT_PX_PER_CELL;
      centerViewportOn(vp, focusRef.current.x, focusRef.current.y);
    } else {
      ensureFocusVisible();
    }
    rendererRef.current?.setFocusCell(focusRef.current);
    applyViewportChange();
    announceCell(focusRef.current.x, focusRef.current.y);
  }, [applyViewportChange, announceCell, ensureFocusVisible]);

  const handleCanvasBlur = useCallback(() => {
    focusFromPointerRef.current = false;
    rendererRef.current?.setFocusCell(null);
    rendererRef.current?.markDirty();
  }, []);

  // Runs before the focus event on a click, so handleCanvasFocus knows the
  // focus came from a pointer and must not re-zoom.
  const handleCanvasPointerDown = useCallback(() => {
    focusFromPointerRef.current = true;
  }, []);

  const handleCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      const vp = vpRef.current;
      if (!vp || editor) return; // the inline editor handles its own keys
      const step = e.shiftKey ? 10 : 1;

      // Reposition mode: arrows nudge the whole cart, Enter/Escape finish.
      if (moveModeRef.current) {
        switch (e.key) {
          case "ArrowUp":
            e.preventDefault();
            tryTranslateSelection(0, -step);
            return;
          case "ArrowDown":
            e.preventDefault();
            tryTranslateSelection(0, step);
            return;
          case "ArrowLeft":
            e.preventDefault();
            tryTranslateSelection(-step, 0);
            return;
          case "ArrowRight":
            e.preventDefault();
            tryTranslateSelection(step, 0);
            return;
          case "Enter":
          case "Escape":
          case " ":
            e.preventDefault();
            exitMoveMode();
            return;
          default:
            return;
        }
      }
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          moveFocus(0, -step);
          break;
        case "ArrowDown":
          e.preventDefault();
          moveFocus(0, step);
          break;
        case "ArrowLeft":
          e.preventDefault();
          moveFocus(-step, 0);
          break;
        case "ArrowRight":
          e.preventDefault();
          moveFocus(step, 0);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (lodTierForScale(vp.scale) < 3) {
            vp.scale = DEFAULT_PX_PER_CELL;
            centerViewportOn(vp, focusRef.current.x, focusRef.current.y);
            applyViewportChange();
          }
          handleTap(focusRef.current.x, focusRef.current.y);
          break;
        case "+":
        case "=":
          e.preventDefault();
          handleZoomIn();
          break;
        case "-":
        case "_":
          e.preventDefault();
          handleZoomOut();
          break;
        default:
          break;
      }
    },
    [editor, moveFocus, handleTap, handleZoomIn, handleZoomOut, applyViewportChange, tryTranslateSelection],
  );

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = container.getBoundingClientRect();
    // Open centered on a word just placed from the homepage calculator, else on
    // the grid's heart (the founding inscription).
    const initialFocus = selectionCentroid() ?? GRID_CENTER;
    focusRef.current = initialFocus;
    const vp = createViewport(rect.width || 1, rect.height || 1, dpr, initialFocus);
    vpRef.current = vp;

    const store = new TileDataStore();
    storeRef.current = store;

    const renderer = createRenderer(canvas, vp, store);
    rendererRef.current = renderer;
    renderer.resize(rect.width || 1, rect.height || 1, dpr);
    renderer.start();
    setTier(lodTierForScale(vp.scale));

    store
      .loadTileSummaries()
      .catch((err) => console.warn("[MonumentExplorer] loadTileSummaries rejected", err))
      .finally(() => {
        // Cap zoom-out to the content region so the grid can't be zoomed out
        // into an empty void beyond where the placed words are.
        const bounds = store.contentBounds();
        if (bounds && vpRef.current) {
          // Frame the content with margin, but never below the legible floor:
          // zooming all the way out must land on the words, not empty parchment.
          vpRef.current.minScale = Math.max(
            fitScaleForBounds(vpRef.current, bounds, ZOOM_OUT_PADDING_CELLS),
            MIN_ZOOM_OUT_PX_PER_CELL,
          );
          clampViewport(vpRef.current);
        }
        renderer.markDirty();
      });
    fetchVisibleTiles();

    // Tier 3 glyphs are drawn with fillText against the ledger-grid webfont,
    // force one repaint once it finishes loading so an early frame never gets
    // stuck showing the browser's fallback serif/sans metrics.
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(() => renderer.markDirty());
    }

    const detachGestures = attachGestures(canvas, vp, {
      onViewportChange: () => {
        hasInteractedRef.current = true;
        renderer.markDirty();
        setTier(lodTierForScale(vp.scale));
      },
      onSettle: fetchVisibleTiles,
      onTap: (cell) => handleTap(cell.x, cell.y),
      // The hand is for dragging; over a cell you can actually act on, show a
      // real pointer (or a crosshair while repositioning) so select vs pan
      // reads at a glance.
      getHoverCursor: (screen) => {
        if (moveModeRef.current) return "crosshair";
        if (lodTierForScale(vp.scale) < 3) return "grab";
        const cell = screenToCell(vp, screen.x, screen.y);
        const cx = Math.floor(cell.x);
        const cy = Math.floor(cell.y);
        if (cx < 0 || cy < 0 || cx >= GRID_SIZE || cy >= GRID_SIZE) return "grab";
        if (selectionStore.has(cx, cy)) return "pointer";
        const serverCell = store.getCell(cx, cy);
        return serverCell === undefined || serverCell.status === "available" ? "pointer" : "grab";
      },
      onPointerMove: (screen) => {
        if (!screen) {
          setPointer(null);
          return;
        }
        const cell = screenToCell(vp, screen.x, screen.y);
        setPointer({
          screenX: screen.x,
          screenY: screen.y,
          cellX: Math.floor(cell.x),
          cellY: Math.floor(cell.y),
        });
      },
    });

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      renderer.resize(width, height, dpr);
      // Keep the opening view centered on the initial focus (placed word or the
      // tribute) across (re)size until the visitor takes over. Without this, a
      // container that measured 0×0 at mount leaves the cell pinned to the
      // top-left corner.
      if (!hasInteractedRef.current) {
        centerViewportOn(vp, initialFocus.x, initialFocus.y, trayInsetPx(containerRef.current));
        renderer.markDirty();
      }
      fetchVisibleTiles();
    });
    resizeObserver.observe(container);

    return () => {
      detachGestures();
      resizeObserver.disconnect();
      renderer.stop();
    };
  }, [fetchVisibleTiles, handleTap]);

  useEffect(() => {
    if (!editor) return;
    // Focus after the overlay mounts so the caret is ready for the next keystroke.
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [editor]);

  function commitCharacter(char: string) {
    if (!editor) return;
    if (!validateCharacter(char)) return;
    selectionStore.setCharacter(editor.x, editor.y, char);
    // Keep typing: hop to the next cell to the right so a whole word can be
    // written in one flow without clicking each square. Closes at a sold cell,
    // the grid edge, or the per-transaction cap.
    advanceEditor(editor.x, editor.y);
  }

  function advanceEditor(fromX: number, fromY: number) {
    const vp = vpRef.current;
    const nextX = fromX + 1;
    if (!vp || nextX >= GRID_SIZE) {
      closeEditor();
      return;
    }
    const occupiedElsewhere =
      !selectionStore.has(nextX, fromY) &&
      (() => {
        const serverCell = storeRef.current?.getCell(nextX, fromY);
        return serverCell !== undefined && serverCell.status !== "available";
      })();
    const atCap =
      !selectionStore.has(nextX, fromY) && selectionStore.getSnapshot().size >= MAX_CELLS_PER_TX;
    if (occupiedElsewhere || atCap) {
      closeEditor();
      return;
    }
    // Follow the caret before measuring: a long word otherwise walks the editor
    // (and the cell it edits) straight off the right edge of the viewport.
    const b = visibleCellBounds(vp);
    const margin = 2;
    if (nextX < b.minX + margin || nextX > b.maxX - margin || fromY < b.minY + margin || fromY > b.maxY - margin) {
      centerViewportOn(vp, nextX, fromY, trayInsetPx(containerRef.current));
      rendererRef.current?.markDirty();
      fetchVisibleTiles();
    }
    const screen = cellToScreen(vp, nextX + 0.5, fromY + 0.5);
    const nextChar = selectionStore.getCharacter(nextX, fromY) ?? "";
    setEditor({
      x: nextX,
      y: fromY,
      screenX: screen.x,
      screenY: screen.y,
      initialCharacter: nextChar,
      colorId: selectionStore.getCellColorId(nextX, fromY),
    });
    // The popup stays mounted (no key remount) so typing keeps flowing. Reset
    // the input value imperatively for the next cell and keep focus.
    const input = inputRef.current;
    if (input) {
      input.value = nextChar;
      input.focus();
      input.select();
    }
  }

  function enterMoveMode() {
    setEditor(null);
    moveModeRef.current = true;
    setMoveMode(true);
    setMoveNotice(null);
    // Focus first: focusing the canvas announces the focused cell, and that
    // announcement would replace this one in the same batch, leaving screen
    // readers with no word about reposition mode at all.
    canvasRef.current?.focus();
    setAnnouncement("Reposition mode. Tap a cell to move your words there. Arrow keys nudge; Enter or Escape finishes.");
  }

  function exitMoveMode() {
    moveModeRef.current = false;
    setMoveMode(false);
    setMoveNotice(null);
    canvasRef.current?.focus();
    setAnnouncement("Reposition finished.");
  }

  function removeSelected() {
    if (!editor) return;
    selectionStore.remove(editor.x, editor.y);
    setEditor(null);
    canvasRef.current?.focus();
  }

  function closeEditor() {
    setEditor(null);
    canvasRef.current?.focus();
  }

  function setEditorColor(id: string) {
    if (!editor) return;
    selectionStore.setCellColor(editor.x, editor.y, id);
    setEditor({ ...editor, colorId: id });
    inputRef.current?.focus();
  }

  function handleEditorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (value.length === 0) return;
    // A space is a free gap between words, not a placeable character: leave this
    // cell empty and hop to the next one. (Covers mobile/IME where keydown for
    // space doesn't fire reliably; desktop is handled in handleEditorKeyDown.)
    if (value === " ") {
      e.target.value = "";
      if (editor) advanceEditor(editor.x, editor.y);
      return;
    }
    if (!validateCharacter(value)) {
      e.target.value = "";
      return;
    }
    commitCharacter(value);
  }

  function handleEditorKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setEditor(null);
      canvasRef.current?.focus();
      return;
    }
    if (e.key === " ") {
      // Space skips a cell (a gap between words) instead of placing a character.
      e.preventDefault();
      if (editor) advanceEditor(editor.x, editor.y);
      return;
    }
    if ((e.key === "Backspace" || e.key === "Delete") && e.currentTarget.value.length === 0) {
      removeSelected();
    }
  }

  return (
    <div ref={containerRef} className="relative h-full w-full select-none overflow-hidden">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className="block h-full w-full cursor-grab touch-none focus:outline-none"
        role="application"
        aria-label="Word Monument grid, one million cells. Arrow keys move between cells, Enter places a character, plus and minus zoom."
        aria-describedby="monument-kbd-help"
        onPointerDown={handleCanvasPointerDown}
        onKeyDown={handleCanvasKeyDown}
        onFocus={handleCanvasFocus}
        onBlur={handleCanvasBlur}
      />

      <p id="monument-kbd-help" className="sr-only">
        Use the arrow keys to move the highlighted cell one step; hold Shift to move ten. Press Enter or Space to
        place or edit a character in the highlighted cell. Press plus or minus to zoom. Each available cell can be
        claimed for one dollar.
      </p>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {editor && (
        <div
          className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: clampPopupCoord(editor.screenX, EDITOR_POPUP_HALF_W, vpRef.current?.width),
            top: clampPopupCoord(editor.screenY, EDITOR_POPUP_HALF_H, vpRef.current?.height),
          }}
        >
          <div className="flex w-[232px] flex-col gap-2 border-2 border-ink bg-parchment-card p-2.5">
            {/* Header: which cell + a clear way to close (Esc also works). */}
            <div className="flex items-center justify-between">
              <span className="font-mono-grid text-[10px] uppercase tracking-wide text-ink-60">
                Cell {editor.x}, {editor.y}
              </span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={closeEditor}
                aria-label="Close"
                className="flex h-5 w-5 items-center justify-center font-body text-base leading-none text-ink-60 hover:text-stamp-red focus-visible:text-stamp-red focus-visible:outline-none"
              >
                &times;
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                defaultValue={editor.initialCharacter}
                onChange={handleEditorChange}
                onKeyDown={handleEditorKeyDown}
                onBlur={() => setEditor(null)}
                maxLength={4}
                className="h-9 w-9 shrink-0 border-2 border-ink bg-parchment text-center font-mono-grid text-lg text-ink outline-none"
                aria-label={`Character for cell ${editor.x}, ${editor.y}`}
              />
              {editor.initialCharacter && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={removeSelected}
                  className="font-mono-grid text-[10px] uppercase tracking-wide text-ink-60 hover:text-stamp-red focus-visible:text-stamp-red focus-visible:outline-none"
                >
                  remove
                </button>
              )}
            </div>

            {/* Per-letter background color. */}
            <div className="flex flex-wrap items-center gap-1">
              {CELL_COLORS.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setEditorColor(color.id)}
                  aria-label={`Color: ${color.label}`}
                  aria-pressed={editor.colorId === color.id}
                  title={color.label}
                  className={`h-5 w-5 border transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
                    editor.colorId === color.id
                      ? "border-ink ring-1 ring-ink ring-offset-1 ring-offset-parchment-card"
                      : "border-ink/25"
                  }`}
                  style={{ backgroundColor: color.bg }}
                />
              ))}
            </div>

            <div className="flex max-h-24 max-w-[210px] flex-wrap justify-center gap-1 overflow-y-auto border-t border-dashed border-rule pt-1.5">
              {QUICK_PICK_CHARS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commitCharacter(ch)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center text-sm hover:bg-ink/[0.06] focus-visible:bg-ink/[0.06] focus-visible:outline-none"
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tier >= 3 && pointer && (
        <CoordinateReadout x={pointer.cellX} y={pointer.cellY} screenX={pointer.screenX} screenY={pointer.screenY} />
      )}

      <ZoomControls onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onFit={handleFit} />

      <Minimap vpRef={vpRef} storeRef={storeRef} onJump={jumpTo} />

      {tier < 3 && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 border border-ink bg-parchment-card px-3 py-1.5 font-mono-grid text-xs uppercase tracking-wide text-ink-60 sm:top-6">
          Zoom in to select a cell &middot; scroll, pinch, or use +
        </div>
      )}

      {moveMode ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-4 sm:pb-6">
          <div className="pointer-events-auto flex items-center gap-3 border-2 border-ink bg-parchment-card px-3 py-2 sm:gap-4 sm:px-4">
            <span className="font-mono-grid text-[11px] uppercase tracking-[0.14em] text-ink sm:text-xs">
              {moveNotice ?? "Tap where you want your words"}
            </span>
            <button
              type="button"
              onClick={exitMoveMode}
              className="shrink-0 border-2 border-ink bg-ink px-3 py-1.5 font-body text-xs font-medium text-parchment transition-all hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <SelectionTray onReposition={enterMoveMode} />
      )}
    </div>
  );
}
