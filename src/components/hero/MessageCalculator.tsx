"use client";

import NumberFlow from "@number-flow/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CELL_PRICE_CENTS, MAX_CELLS_PER_TX } from "@/lib/config";
import { tokenizeMessage } from "@/lib/monument/tokenize";
import { selectionStore } from "@/lib/monument/selection-store";
import { formatUSD } from "@/lib/format";

/**
 * "Type what you want to say" calculator. Lets a first-time visitor feel the
 * price before they ever touch the grid. Every
 * non-space character typed is priced live, exactly as the monument would
 * charge for it (spaces are free gaps between words, matching the hero's
 * "$1.00 / letter" copy). "Go place it" then seeds the cart with the typed
 * message and sends them to the grid with it already placed.
 */
export default function MessageCalculator() {
  const router = useRouter();
  const [message, setMessage] = useState("");

  const tokens = useMemo(() => tokenizeMessage(message), [message]);
  const letterCount = useMemo(() => tokens.filter((t) => !t.isSpace).length, [tokens]);
  const hasInvalidCharacter = useMemo(
    () => tokens.some((t) => !t.isSpace && !t.isValid),
    [tokens]
  );

  const costCents = letterCount * CELL_PRICE_CENTS;
  const hasMessage = letterCount > 0;
  const canPlace = hasMessage && !hasInvalidCharacter;

  function handlePlace() {
    if (!canPlace) return;
    // Seed the cart, then go to the grid. The selection persists via
    // sessionStorage, so the explorer opens with the word already placed.
    selectionStore.placeMessage(message);
    router.push("/monument");
  }

  return (
    <div className="border border-ink bg-parchment-card">
      <div className="border-b border-ink px-6 py-3">
        <p className="font-mono-grid text-[11px] uppercase tracking-[0.2em] text-ink-60">
          Calculate your entry
        </p>
      </div>

      <div className="px-6 py-6 sm:px-8 sm:py-8">
        <label htmlFor="message-calculator-input" className="font-body text-sm text-ink-60">
          Type what you want to say
        </label>

        <input
          id="message-calculator-input"
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MAX_CELLS_PER_TX}
          placeholder="type what you want to say"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={hasInvalidCharacter}
          aria-describedby={hasInvalidCharacter ? "message-calculator-warning" : undefined}
          className={`mt-2 w-full border-b-2 bg-transparent py-2 font-mono-grid text-xl text-ink outline-none transition-colors placeholder:text-ink-60/50 sm:text-2xl ${
            hasInvalidCharacter ? "border-stamp-red" : "border-ink focus:border-stamp-red"
          }`}
        />

        {/* Only shown when something's wrong. It highlights exactly which
            characters aren't allowed. For valid input it would just echo the
            field, so it stays hidden. */}
        {hasInvalidCharacter && (
          <p
            aria-hidden="true"
            className="mt-2 min-h-[1.5em] break-all font-mono-grid text-sm leading-relaxed"
          >
            {tokens.map((token, index) =>
              token.isSpace ? (
                <span key={index}>&nbsp;</span>
              ) : (
                <span
                  key={index}
                  className={
                    token.isValid
                      ? "text-ink-60"
                      : "text-stamp-red underline decoration-2 underline-offset-4"
                  }
                >
                  {token.char}
                </span>
              )
            )}
          </p>
        )}

        {hasInvalidCharacter && (
          <p
            id="message-calculator-warning"
            className="mt-2 font-body text-sm text-stamp-red"
          >
            Some characters here aren&rsquo;t allowed. Only letters, numbers, basic punctuation, and
            a small emoji set work.
          </p>
        )}

        <dl className="mt-8 grid grid-cols-1 gap-6 border-t border-dashed border-rule pt-6 sm:grid-cols-3">
          <div>
            <dt className="font-mono-grid text-[11px] uppercase tracking-[0.2em] text-ink-60">
              Letters
            </dt>
            <dd
              className={`mt-1 font-mono-grid text-3xl ${hasMessage ? "text-ink" : "text-ink-60"}`}
            >
              <NumberFlow value={letterCount} />
            </dd>
          </div>

          <div>
            <dt className="font-mono-grid text-[11px] uppercase tracking-[0.2em] text-ink-60">
              Total cost
            </dt>
            <dd
              className={`mt-1 font-mono-grid text-3xl ${hasMessage ? "text-ink" : "text-ink-60"}`}
            >
              $
              <NumberFlow
                value={costCents / 100}
                format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
              />
            </dd>
          </div>

          <div>
            <dt className="font-mono-grid text-[11px] uppercase tracking-[0.2em] text-ink-60">
              It stays up
            </dt>
            <dd
              className={`mt-1 font-mono-grid text-3xl font-semibold ${
                hasMessage ? "text-ink" : "text-ink-60"
              }`}
            >
              Forever
            </dd>
          </div>
        </dl>

        <p className="mt-4 font-body text-sm leading-relaxed text-ink-60">
          {hasMessage ? (
            <>
              {letterCount} letter{letterCount === 1 ? "" : "s"} &middot;{" "}
              {formatUSD(costCents, { decimals: true })} total &middot;{" "}
              <span className="text-ink">placed the instant you pay</span>, permanent
              the instant it&rsquo;s placed. Spaces between words are free.
            </>
          ) : (
            <>Spaces are free. You only pay for the letters, numbers, and marks you place.</>
          )}
        </p>

        <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handlePlace}
            disabled={!canPlace}
            className="group inline-flex items-center gap-3 border-2 border-ink bg-ink px-6 py-3 font-body text-sm font-medium text-parchment transition-all hover:-translate-y-0.5 hover:border-stamp-red hover:bg-stamp-red focus-visible:-translate-y-0.5 focus-visible:border-stamp-red focus-visible:bg-stamp-red focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
          >
            Go place it
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              &rarr;
            </span>
          </button>
          <span className="font-body text-sm text-ink-60">
            {canPlace ? "We'll drop it on the grid, ready to claim." : "Type a few letters to place them on the grid."}
          </span>
        </div>
      </div>
    </div>
  );
}
