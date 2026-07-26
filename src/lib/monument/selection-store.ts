"use client";

// Hand-rolled module-singleton store (useSyncExternalStore), not zustand/jotai,
// per this codebase's house convention. Holds the in-progress cart: a Map from
// "x,y" to the chosen character, since character entry happens INLINE at
// selection time (see MonumentExplorer), not deferred to /checkout. A parallel
// map holds each cell's chosen background color, so a buyer can color their
// inscription letter by letter (the editor picker sets one cell; the tray
// picker applies to the whole cart).
//
// Deliberately persisted to sessionStorage rather than localStorage: a cart
// should not silently survive across browser sessions once a reservation TTL
// has plausibly expired server-side.

import { useCallback, useSyncExternalStore } from "react";
import { CELL_PRICE_CENTS, GRID_SIZE, MAX_CELLS_PER_TX } from "@/lib/config";
import { DEFAULT_CELL_COLOR_ID } from "@/lib/monument/colors";
import { tokenizeMessage } from "@/lib/monument/tokenize";

// Row the "Go place it" calculator drops a freshly-typed message on: a clear
// band just above the grid's heart, away from the founding inscription, so the
// placed word lands on empty parchment and the explorer can center on it.
const PLACE_ANCHOR_Y = Math.floor(GRID_SIZE / 2) - 20;

export interface SelectedCell {
  x: number;
  y: number;
  character: string;
  /** This cell's chosen background color id (see @/lib/monument/colors). */
  color: string;
}

type Listener = () => void;

const STORAGE_KEY = "wordmonument:selection:v2";
const COLOR_STORAGE_KEY = "wordmonument:color:v1";

interface PersistedSelection {
  cells: Map<string, string>;
  colors: Map<string, string>;
}

function readPersistedColorId(): string {
  if (typeof window === "undefined") return DEFAULT_CELL_COLOR_ID;
  try {
    return window.sessionStorage.getItem(COLOR_STORAGE_KEY) ?? DEFAULT_CELL_COLOR_ID;
  } catch {
    return DEFAULT_CELL_COLOR_ID;
  }
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function parseCellKey(key: string): { x: number; y: number } {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

function readPersisted(): PersistedSelection {
  const empty: PersistedSelection = { cells: new Map(), colors: new Map() };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as {
      cells?: [string, string][];
      colors?: [string, string][];
    };
    return {
      cells: new Map(parsed.cells ?? []),
      colors: new Map(parsed.colors ?? []),
    };
  } catch {
    // corrupted or inaccessible sessionStorage - start from an empty cart
    return empty;
  }
}

class SelectionStore {
  private cells: Map<string, string>;
  private cellColors: Map<string, string>;
  /** The brush: default color for newly placed cells and the "apply to all" value. */
  private colorId: string = readPersistedColorId();
  private listeners = new Set<Listener>();

  constructor() {
    const persisted = readPersisted();
    this.cells = persisted.cells;
    this.cellColors = persisted.colors;
  }

  private persist(): void {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          cells: Array.from(this.cells.entries()),
          colors: Array.from(this.cellColors.entries()),
        })
      );
    } catch {
      // private-mode / quota-exceeded - selection continues to work in-memory only
    }
  }

  private commit(next: Map<string, string>): void {
    this.cells = next;
    this.persist();
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Stable reference until mutated - required for useSyncExternalStore. */
  getSnapshot = (): Map<string, string> => this.cells;

  has(x: number, y: number): boolean {
    return this.cells.has(cellKey(x, y));
  }

  getCharacter(x: number, y: number): string | undefined {
    return this.cells.get(cellKey(x, y));
  }

  setCharacter(x: number, y: number, character: string): void {
    const key = cellKey(x, y);
    // A newly placed cell inherits the current brush color unless it already
    // has one from a previous edit.
    if (!this.cellColors.has(key)) this.cellColors.set(key, this.colorId);
    const next = new Map(this.cells);
    next.set(key, character);
    this.commit(next);
  }

  toggle(x: number, y: number, character: string): void {
    const key = cellKey(x, y);
    if (this.cells.has(key)) {
      this.remove(x, y);
      return;
    }
    if (!this.cellColors.has(key)) this.cellColors.set(key, this.colorId);
    const next = new Map(this.cells);
    next.set(key, character);
    this.commit(next);
  }

  remove(x: number, y: number): void {
    const key = cellKey(x, y);
    if (!this.cells.has(key)) return;
    this.cellColors.delete(key);
    const next = new Map(this.cells);
    next.delete(key);
    this.commit(next);
  }

  clear(): void {
    if (this.cells.size === 0) return;
    this.cellColors.clear();
    this.commit(new Map());
  }

  /**
   * Replaces the cart with a freshly-typed message laid out on a single row -
   * letters on consecutive cells, spaces left as gaps - centered horizontally
   * on the grid. Used by the homepage "Go place it" button so the visitor lands
   * on the grid with their words already placed instead of retyping them.
   * Returns how many cells were placed.
   */
  placeMessage(message: string): number {
    const tokens = tokenizeMessage(message).filter((t) => t.isSpace || t.isValid);
    while (tokens.length > 0 && tokens[0].isSpace) tokens.shift();
    while (tokens.length > 0 && tokens[tokens.length - 1].isSpace) tokens.pop();

    if (tokens.length === 0) {
      this.clear();
      return 0;
    }

    const width = Math.min(tokens.length, MAX_CELLS_PER_TX);
    const startX = Math.max(0, Math.min(GRID_SIZE - width, Math.floor(GRID_SIZE / 2) - Math.floor(width / 2)));

    const next = new Map<string, string>();
    const colors = new Map<string, string>();
    let x = startX;
    let placed = 0;
    for (const token of tokens) {
      if (x >= GRID_SIZE || placed >= MAX_CELLS_PER_TX) break;
      if (!token.isSpace) {
        const key = cellKey(x, PLACE_ANCHOR_Y);
        next.set(key, token.char);
        colors.set(key, this.colorId);
        placed += 1;
      }
      x += 1;
    }

    this.cellColors = colors;
    this.commit(next);
    return placed;
  }

  /**
   * Moves the WHOLE cart by (dx, dy) cells, keeping every character and color.
   * Powers the "reposition" mode: a word seeded by the homepage calculator (or
   * typed in the wrong spot) can be dropped somewhere else without retyping.
   * Bounds-only validation here; collision with sold/reserved cells is the
   * explorer's job, since only it can see server cell state. Returns false
   * (and changes nothing) if any cell would leave the grid.
   */
  translateBy(dx: number, dy: number): boolean {
    if (this.cells.size === 0) return false;
    if (dx === 0 && dy === 0) return true;

    const nextCells = new Map<string, string>();
    const nextColors = new Map<string, string>();
    for (const [key, character] of this.cells) {
      const { x, y } = parseCellKey(key);
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) return false;
      const nk = cellKey(nx, ny);
      nextCells.set(nk, character);
      const color = this.cellColors.get(key);
      if (color) nextColors.set(nk, color);
    }

    this.cellColors = nextColors;
    this.commit(nextCells);
    return true;
  }

  // ---- Color -----------------------------------------------------------------

  /** The current brush color id (default for new cells / the tray swatch state). */
  getColorId(): string {
    return this.colorId;
  }

  /** This cell's chosen color id, falling back to the current brush. */
  getCellColorId(x: number, y: number): string {
    return this.cellColors.get(cellKey(x, y)) ?? this.colorId;
  }

  /** Overrides a single cell's color (the editor's per-letter picker). */
  setCellColor(x: number, y: number, id: string): void {
    const key = cellKey(x, y);
    if (this.cellColors.get(key) === id) return;
    this.cellColors.set(key, id);
    this.commit(new Map(this.cells));
  }

  /** Sets the brush AND paints every currently-selected cell (the tray picker). */
  setColorId(id: string): void {
    this.colorId = id;
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(COLOR_STORAGE_KEY, id);
      } catch {
        // private-mode / quota - keep the color in-memory only
      }
    }
    for (const key of this.cells.keys()) this.cellColors.set(key, id);
    // Re-commit a fresh Map so useSyncExternalStore sees a new snapshot and the
    // canvas subscription redraws every selected cell in the new color.
    this.commit(new Map(this.cells));
  }

  totalCents(): number {
    return this.cells.size * CELL_PRICE_CENTS;
  }
}

/**
 * Plain non-hook singleton the canvas draw loop reads synchronously every
 * frame (selectionStore.has / getCharacter) without subscribing to React -
 * panning and zooming must never trigger a React re-render.
 */
export const selectionStore = new SelectionStore();

export interface UseSelectionResult {
  cells: SelectedCell[];
  selectedKeys: Set<string>;
  totalCents: number;
  colorId: string;
  toggle: (x: number, y: number, character: string) => void;
  setCharacter: (x: number, y: number, character: string) => void;
  setColor: (id: string) => void;
  remove: (x: number, y: number) => void;
  clear: () => void;
}

function emptySnapshot(): Map<string, string> {
  return new Map();
}

export function useSelection(): UseSelectionResult {
  const snapshot = useSyncExternalStore(
    selectionStore.subscribe,
    selectionStore.getSnapshot,
    emptySnapshot
  );

  const toggle = useCallback(
    (x: number, y: number, character: string) => selectionStore.toggle(x, y, character),
    []
  );
  const setCharacter = useCallback(
    (x: number, y: number, character: string) => selectionStore.setCharacter(x, y, character),
    []
  );
  const setColor = useCallback((id: string) => selectionStore.setColorId(id), []);
  const remove = useCallback((x: number, y: number) => selectionStore.remove(x, y), []);
  const clear = useCallback(() => selectionStore.clear(), []);

  const cells: SelectedCell[] = Array.from(snapshot.entries()).map(([key, character]) => {
    const { x, y } = parseCellKey(key);
    return { x, y, character, color: selectionStore.getCellColorId(x, y) };
  });

  return {
    cells,
    selectedKeys: new Set(snapshot.keys()),
    totalCents: cells.length * CELL_PRICE_CENTS,
    colorId: selectionStore.getColorId(),
    toggle,
    setCharacter,
    setColor,
    remove,
    clear,
  };
}
