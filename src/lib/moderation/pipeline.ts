import { validateCharacter } from '@/lib/moderation/charset';
import { assembleMessage, assembleRuns, checkBlocklist } from '@/lib/moderation/blocklist';
import { moderateText } from '@/lib/moderation/openai';
import { getReservationCells } from '@/lib/db/cells';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export interface PreReservationCheckResult {
  ok: boolean;
  reason?: string;
}

interface PreReservationCell {
  x: number;
  y: number;
  character: string;
}

/**
 * Synchronous, cheap gate run at reservation time (before payment). Rejects
 * invalid characters outright, then runs the deterministic blocklist
 * against the assembled text. This does NOT call the OpenAI moderation
 * API - that only happens after purchase, in postPurchaseModerationCheck.
 *
 * Takes full {x,y,character} cells, not a bare characters[], and reads them in
 * grid reading order (y then x) - the SAME order the public grid actually
 * renders in and postPurchaseModerationCheck evaluates. Joining them in client
 * submission order would let an attacker reorder the request array so the
 * blocklist check sees a harmless permutation while the live grid still spells
 * out the blocked term at its real coordinates.
 *
 * Checks each contiguous run on its own rather than the whole selection joined
 * end to end: a selection spanning several rows or with gaps in it is not one
 * word, and treating it as one invents terms the buyer never wrote.
 */
export function preReservationCheck(cells: PreReservationCell[]): PreReservationCheckResult {
  for (const cell of cells) {
    if (!validateCharacter(cell.character)) {
      return { ok: false, reason: 'invalid_character' };
    }
  }

  for (const run of assembleRuns(cells)) {
    if (checkBlocklist(run).blocked) {
      return { ok: false, reason: 'blocked_content' };
    }
  }

  return { ok: true };
}

// How far left/right of the requested cells to pull already-sold neighbours
// when reconstructing run text - comfortably longer than any single blocked
// term, so a slur split across the purchase boundary is still assembled whole.
const CROSS_RESERVATION_MARGIN = 24;

/**
 * Defends against splitting a blocked term across several separate $1
 * purchases: a per-reservation check alone never sees the neighbours. Here we
 * pull the already-sold cells horizontally adjacent to the requested cells (same
 * row, within a margin), merge them with the request, reassemble each
 * contiguous run in grid reading order, and blocklist-check it - so whoever
 * completes the word last is rejected. Async + DB-backed, so it runs at reserve
 * time alongside the reservation itself, not in the sync pre-check.
 *
 * Fails CLOSED with 'moderation_unavailable' when the query breaks: nothing
 * else in the system ever looks at a term spread across separate purchases (the
 * post-purchase OpenAI pass only ever sees one reservation's own text), so an
 * error here is the whole check, not one of two. The reserve route turns that
 * reason into a retryable 503 rather than a content rejection.
 */
export async function crossReservationBlocklistCheck(
  cells: PreReservationCell[]
): Promise<PreReservationCheckResult> {
  if (cells.length === 0) {
    return { ok: true };
  }

  try {
    const rows = [...new Set(cells.map((cell) => cell.y))];
    const minX = Math.min(...cells.map((cell) => cell.x));
    const maxX = Math.max(...cells.map((cell) => cell.x));

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('cells')
      .select('x, y, character')
      .in('y', rows)
      .gte('x', minX - CROSS_RESERVATION_MARGIN)
      .lte('x', maxX + CROSS_RESERVATION_MARGIN)
      .eq('status', 'sold')
      .not('character', 'is', null);

    if (error) {
      console.error('[moderation/pipeline] crossReservationBlocklistCheck query failed', error);
      return { ok: false, reason: 'moderation_unavailable' };
    }

    const sold = (data ?? []) as { x: number; y: number; character: string }[];

    for (const run of assembleRuns([...cells, ...sold])) {
      if (checkBlocklist(run).blocked) {
        return { ok: false, reason: 'blocked_content' };
      }
    }

    return { ok: true };
  } catch (error) {
    console.error('[moderation/pipeline] crossReservationBlocklistCheck failed', error);
    return { ok: false, reason: 'moderation_unavailable' };
  }
}

/**
 * Post-purchase moderation pass. Never throws - callers (the checkout
 * webhook, the moderation-sweep cron) must not have their own response
 * affected by a moderation failure. Errors are logged and swallowed.
 *
 * - result === null (network/timeout/parse failure): do nothing, leave
 *   moderation_checked_at null so the moderation-sweep cron retries later.
 * - result !== null: persist flagged/clear + raw categories/scores on every
 *   cell belonging to this reservation.
 */
export async function postPurchaseModerationCheck(reservationId: string): Promise<void> {
  try {
    const reservationState = await getReservationCells(reservationId);
    const cells = reservationState.cells;
    if (!cells || cells.length === 0) {
      return;
    }

    const cellsForAssembly = cells
      .filter((cell) => cell.character !== null)
      .map((cell) => ({ x: cell.x, y: cell.y, character: cell.character as string }));

    if (cellsForAssembly.length === 0) {
      return;
    }

    const message = assembleMessage(cellsForAssembly);

    const result = await moderateText(message);

    if (result === null) {
      return;
    }

    const supabaseAdmin = getSupabaseAdmin();
    const checkedAt = new Date().toISOString();
    const moderationStatus = result.flagged ? 'flagged' : 'clear';
    const moderationFlags = { categories: result.categories, scores: result.scores };

    await Promise.all(
      cells.map((cell) =>
        supabaseAdmin
          .from('cells')
          .update({
            moderation_status: moderationStatus,
            moderation_flags: moderationFlags,
            moderation_checked_at: checkedAt,
          })
          .eq('id', cell.id)
      )
    );
  } catch (error) {
    console.error('[moderation/pipeline] postPurchaseModerationCheck failed', reservationId, error);
  }
}
