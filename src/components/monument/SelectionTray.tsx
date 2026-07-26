"use client";

import NumberFlow from "@number-flow/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSelection } from "@/lib/monument/selection-store";
import { getAssignedVariantId } from "@/lib/hero/useHeroVariant";
import { CELL_COLORS } from "@/lib/monument/colors";

interface ConflictCell {
  x: number;
  y: number;
}

interface ReserveResponseBody {
  reservationId?: string;
  error?: string;
  message?: string;
  // /api/reserve returns 409 with { error, unavailableCells: [{x,y}] }.
  // The extra keys are belt-and-braces fallbacks.
  unavailableCells?: ConflictCell[];
  cells?: ConflictCell[];
  conflicts?: ConflictCell[];
}

/**
 * Fixed bottom bar styled like a torn receipt strip: jagged top edge, ledger-rule
 * dividers between line items, a live count/total, and the one deliberate
 * full-red-block CTA in the whole product.
 */
export default function SelectionTray({ onReposition }: { onReposition?: () => void }) {
  const router = useRouter();
  const selection = useSelection();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictCell[]>([]);

  if (selection.cells.length === 0) return null;

  const dollars = selection.totalCents / 100;

  // The single color shared by every selected cell, or null when they differ.
  // Drives which "Recolor all" swatch reads as active.
  const uniformColorId =
    new Set(selection.cells.map((c) => c.color)).size === 1 ? selection.cells[0].color : null;

  function isConflicted(x: number, y: number): boolean {
    return conflicts.some((c) => c.x === x && c.y === y);
  }

  function removeCell(x: number, y: number) {
    selection.remove(x, y);
    setConflicts((prev) => prev.filter((c) => !(c.x === x && c.y === y)));
  }

  async function handleCheckout() {
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    setConflicts([]);

    try {
      const response = await fetch("/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Each cell carries its own chosen background color id.
          cells: selection.cells.map((c) => ({ x: c.x, y: c.y, character: c.character, color: c.color })),
          // Carries the homepage A/B variant (set in sessionStorage) to the
          // reservation so a completed purchase can be credited to it.
          heroVariant: getAssignedVariantId() ?? undefined,
        }),
      });

      if (response.status === 409) {
        const body = (await response.json().catch(() => null)) as ReserveResponseBody | null;
        const taken = body?.unavailableCells ?? body?.cells ?? body?.conflicts ?? [];
        setConflicts(taken);
        setError(
          taken.length > 0
            ? `${taken.length} cell${taken.length === 1 ? "" : "s"} were just taken by someone else. Remove them below and try again.`
            : "Some of your cells were just taken. Please review your selection."
        );
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ReserveResponseBody | null;
        // Demo/live-preview build with no backend: not an error, just say so.
        if (response.status === 503 && body?.error === "preview") {
          setNotice(body.message ?? "This is a live preview. Claiming words is coming soon.");
          return;
        }
        setError(body?.error ?? "Could not reserve those cells. Please try again.");
        return;
      }

      const body = (await response.json()) as ReserveResponseBody;
      if (!body.reservationId) {
        setError("Reservation succeeded but no reservation id was returned.");
        return;
      }
      router.push(`/checkout?reservationId=${encodeURIComponent(body.reservationId)}`);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 sm:px-6 sm:pb-6">
      <div
        className="pointer-events-auto w-full max-w-3xl border-t-2 border-ink bg-parchment-card"
        style={{ clipPath: tornEdgeClipPath() }}
      >
        {error && (
          <div className="border-b border-stamp-red/30 bg-stamp-red/10 px-4 py-2 font-body text-sm text-stamp-red sm:px-6">
            {error}
          </div>
        )}

        {notice && (
          <div className="border-b border-ink/15 bg-parchment-aged px-4 py-2 font-body text-sm text-ink sm:px-6">
            {notice}
          </div>
        )}

        <ul className="max-h-40 divide-y divide-dashed divide-rule overflow-y-auto">
          {selection.cells.map((cell) => {
            const conflicted = isConflicted(cell.x, cell.y);
            return (
              <li
                key={`${cell.x},${cell.y}`}
                className={`flex items-center justify-between px-4 py-1.5 font-mono-grid text-sm sm:px-6 ${
                  conflicted ? "bg-stamp-red/10 text-stamp-red" : "text-ink"
                }`}
              >
                <span>
                  ({String(cell.x).padStart(4, "0")}, {String(cell.y).padStart(4, "0")}) &ldquo;{cell.character}
                  &rdquo;
                  {conflicted ? " · taken" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => removeCell(cell.x, cell.y)}
                  className="ml-3 shrink-0 text-xs uppercase tracking-wide text-ink-60 transition-colors hover:text-stamp-red focus-visible:text-stamp-red focus-visible:outline-none"
                  aria-label={`Remove cell ${cell.x}, ${cell.y}`}
                >
                  remove
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-3 border-t border-dashed border-rule px-4 py-2.5 sm:px-6">
          <span className="shrink-0 font-mono-grid text-xs uppercase tracking-wide text-ink-60">
            Recolor all
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {CELL_COLORS.map((color) => {
              // Highlight a swatch only when every cell already shares that color;
              // a mixed selection highlights nothing, so the control never lies
              // about what's on the grid.
              const active = uniformColorId === color.id;
              return (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => selection.setColor(color.id)}
                  aria-label={`Set all ${selection.cells.length} cells to ${color.label}`}
                  aria-pressed={active}
                  title={`Set all cells to ${color.label}`}
                  className={`h-6 w-6 border transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
                    active
                      ? "border-ink ring-2 ring-ink ring-offset-1 ring-offset-parchment-card"
                      : "border-ink/25"
                  }`}
                  style={{ backgroundColor: color.bg }}
                />
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 border-t border-dashed border-rule px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="whitespace-nowrap font-mono-grid text-sm text-ink">
            <span className="text-ink-60">
              {selection.cells.length} cell{selection.cells.length === 1 ? "" : "s"} selected ·{" "}
            </span>
            <span className="text-base font-semibold">
              $
              <NumberFlow value={dollars} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
            </span>
          </div>
          <div className="flex items-center gap-2 sm:justify-end">
            {onReposition && (
              <button
                type="button"
                onClick={onReposition}
                title="Move your words somewhere else on the grid"
                className="shrink-0 border-2 border-ink bg-parchment px-3 py-2.5 font-body text-sm font-medium text-ink transition-all hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none"
              >
                <span className="sm:hidden">Move</span>
                <span className="hidden sm:inline">Reposition</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleCheckout}
              disabled={isSubmitting}
              className="flex-1 border-2 border-stamp-red bg-stamp-red px-4 py-2.5 text-center font-body text-sm font-medium text-parchment transition-all hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 sm:flex-none sm:px-5"
            >
              {isSubmitting ? "Reserving…" : "Review & Checkout"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A torn-receipt jagged top edge as a repeating triangular clip-path. */
function tornEdgeClipPath(): string {
  const teeth = 25;
  const points: string[] = [];
  for (let i = 0; i <= teeth; i++) {
    const x = (i / teeth) * 100;
    const y = i % 2 === 0 ? 6 : 0;
    points.push(`${x}% ${y}px`);
  }
  points.push("100% 100%", "0% 100%");
  return `polygon(${points.join(", ")})`;
}
