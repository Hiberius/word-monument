import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { postPurchaseModerationCheck } from '@/lib/moderation/pipeline';
import { constantTimeEqual } from '@/lib/security/constant-time';

// Bounds run time per invocation - this cron runs on a schedule, so
// anything left over is picked up on the next run.
const MAX_RESERVATIONS_PER_SWEEP = 200;

// Cast a wide net on the raw cell query before de-duplicating down to
// distinct reservation ids, since a single reservation can span many cells.
const RAW_CELL_QUERY_LIMIT = 5000;

interface PendingCellRow {
  reservation_id: string | null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const cronSecret = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;
  if (!cronSecret || !expectedSecret || !(await constantTimeEqual(cronSecret, expectedSecret))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // The reservation_id filter is what makes this sweep group work into whole
  // inscriptions instead of loose characters, but it also means a sold cell
  // with no reservation_id is invisible here forever: it would sit with
  // moderation_checked_at NULL and never be picked up. Every real purchase has
  // one, so the only rows that can land in that state are ones written
  // directly to the database (the seeded founding inscriptions, owner_label
  // 'seed'). Those are stamped as checked at insert time. Anything else
  // written by hand must be stamped the same way or it silently skips
  // moderation.
  const { data, error } = await supabaseAdmin
    .from('cells')
    .select('reservation_id')
    .eq('status', 'sold')
    .eq('moderation_status', 'clear')
    .is('moderation_checked_at', null)
    .not('reservation_id', 'is', null)
    .limit(RAW_CELL_QUERY_LIMIT);

  if (error) {
    console.error('[api/cron/moderation-sweep] failed to query pending cells', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const rows = (data ?? []) as PendingCellRow[];
  const reservationIds = Array.from(
    new Set(rows.map((row) => row.reservation_id).filter((id): id is string => Boolean(id)))
  ).slice(0, MAX_RESERVATIONS_PER_SWEEP);

  for (const reservationId of reservationIds) {
    await postPurchaseModerationCheck(reservationId);
  }

  return NextResponse.json({ checked: reservationIds.length }, { status: 200 });
}
