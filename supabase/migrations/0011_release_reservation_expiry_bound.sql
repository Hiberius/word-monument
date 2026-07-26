-- Word Monument - stop a stale checkout.session.expired from freeing a live hold
--
-- /api/checkout allows a few Stripe sessions per reservation (browser Back from
-- the Stripe page, a lost response then a retry), and each new session calls
-- extend_reservation, which re-anchors reserved_until further into the future.
-- So one reservation can legitimately have an OLD session that is about to
-- expire and a NEWER session that is still open and payable.
--
-- release_reservation used to free every row WHERE reservation_id = X AND
-- status = 'reserved', with no time check, so the old session's expiry event
-- wiped a hold the newer session was still counting on:
--
--   12:00 reserve            reserved_until 12:35
--   12:00 session A created  expires_at     12:35
--   12:20 session B created  reserved_until 12:55  (extend_reservation)
--   12:35 Stripe fires checkout.session.expired for session A
--         -> cells released while session B is still payable
--   12:40 buyer pays on session B, is charged in full
--         -> complete_purchase_atomic finds nothing, buyer is auto-refunded
--            and receives nothing, and in the gap the cells can be sold to
--            someone else
--
-- The fix takes the expiring session's own expires_at and refuses to release a
-- hold that already reaches beyond it, which is exactly the "a newer session
-- extended this" case. Passing NULL keeps the old unconditional behavior for
-- any caller that has no expiry to hand.

CREATE OR REPLACE FUNCTION release_reservation(
  p_reservation_id uuid,
  p_session_expires_at timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released_count integer;
BEGIN
  UPDATE cells
  SET status = 'available',
      character = NULL,
      reservation_id = NULL,
      reserved_until = NULL,
      reserved_by_ip_hash = NULL,
      owner_label = NULL,
      updated_at = now()
  WHERE reservation_id = p_reservation_id
    AND status = 'reserved'
    -- Only release a hold this session still owns. A newer session always
    -- pushes reserved_until past the older session's expires_at, so a stale
    -- expiry event becomes a no-op instead of a refund-and-lose-the-sale.
    AND (p_session_expires_at IS NULL OR reserved_until <= p_session_expires_at);

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  RETURN v_released_count;
END;
$$;

-- The old 1-arg signature would otherwise linger as a second overload and give
-- PostgREST an ambiguous choice.
DROP FUNCTION IF EXISTS release_reservation(uuid);

REVOKE ALL ON FUNCTION release_reservation(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION release_reservation(uuid, timestamptz)
  TO service_role;
