import { getSupabaseAdmin } from '@/lib/supabase/admin';

// Passed as p_auto_flag_threshold: once a cell accumulates this many
// distinct-IP reports, the report_cell RPC is expected to auto-flag it.
// Deliberately not tiny (e.g. 3) - a handful of cheap proxy IPs can trivially
// clear a low threshold and flood the single shared admin's moderation queue
// with sold, non-violating cells (flagging doesn't hide content, so this is
// a moderation-workflow DoS, not a content-safety bypass). This is a rate
// floor, not a real anti-abuse system - see /api/reports' per-IP rate limit
// for the actual throttle.
const AUTO_FLAG_THRESHOLD = 8;

/**
 * Calls the report_cell(p_cell_id, p_reason, p_ip_hash, p_auto_flag_threshold)
 * RPC. Returns whether a NEW report was recorded - false if this hashed IP
 * already reported this cell (the RPC is expected to enforce that
 * uniqueness server-side, e.g. via a unique constraint on (cell_id, ip_hash)).
 */
export async function reportCell(cellId: number, reason: string, ipHash: string): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin.rpc('report_cell', {
    p_cell_id: cellId,
    p_reason: reason,
    p_ip_hash: ipHash,
    p_auto_flag_threshold: AUTO_FLAG_THRESHOLD,
  });

  if (error) {
    console.error('[db/reports] report_cell RPC failed', error);
    return false;
  }

  return Boolean(data);
}
