-- Word Monument - let a visitor take back their own superseded hold
--
-- reserve_cells_atomic caps how many cells one ip_hash may hold at once, and
-- nothing frees a hold early except a Stripe session expiring. So a visitor who
-- reserves 150 cells, changes their mind and reselects is refused by their OWN
-- abandoned selection for the rest of its 35-minute TTL, with no way to give it
-- back and no error they can act on.
--
--   12:00 reserve 150 cells        -> hold until 12:35
--   12:02 reselect 200 other cells -> 150 + 200 > 300 cap, rejected
--   12:02..12:35 every retry is rejected by the visitor's own dead hold
--
-- /api/reserve calls this ONLY after the cap has already fired, for the hash of
-- the caller's own IP, then retries the reservation exactly once. Scoping every
-- row to reserved_by_ip_hash = p_ip_hash is what keeps it incapable of touching
-- anyone else's cells.
--
-- p_ttl_seconds is the plain reservation TTL, and the bound it puts on
-- reserved_until is what keeps a checkout in flight out of this: /api/checkout
-- re-anchors the hold to TTL + slack before creating the Stripe session, so a
-- hold reaching beyond now + TTL belongs to a session that may still be paid,
-- and freeing it would charge the buyer for cells that no longer exist. That
-- protection lasts as long as the slack window, after which an extended hold is
-- indistinguishable from a fresh one.

CREATE OR REPLACE FUNCTION release_ip_reservations(
  p_ip_hash text,
  p_ttl_seconds integer DEFAULT 2100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now CONSTANT timestamptz := now();
  v_released_count integer;
BEGIN
  -- An empty hash would otherwise match every row reserved before
  -- reserved_by_ip_hash was populated.
  IF p_ip_hash IS NULL OR length(p_ip_hash) = 0 THEN
    RETURN 0;
  END IF;

  IF p_ttl_seconds IS NULL OR p_ttl_seconds <= 0 OR p_ttl_seconds > 7200 THEN
    RAISE EXCEPTION 'invalid ttl';
  END IF;

  -- Same lock reserve_cells_atomic takes, so a release cannot interleave with a
  -- concurrent same-IP reservation counting the rows it is freeing.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));

  UPDATE cells
  SET status = 'available',
      character = NULL,
      background_color = NULL,
      reservation_id = NULL,
      reserved_until = NULL,
      reserved_by_ip_hash = NULL,
      owner_label = NULL,
      updated_at = v_now
  WHERE reserved_by_ip_hash = p_ip_hash
    AND status = 'reserved'
    AND reserved_until <= v_now + make_interval(secs => p_ttl_seconds);

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  RETURN v_released_count;
END;
$$;

REVOKE ALL ON FUNCTION release_ip_reservations(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION release_ip_reservations(text, integer)
  TO service_role;
