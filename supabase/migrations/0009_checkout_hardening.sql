-- Word Monument - checkout window hardening
--
-- Two fixes from the payments audit:
--
-- 1. extend_reservation: Stripe requires a Checkout Session's expires_at to be
--    at least ~30 minutes in the future, measured from SESSION creation, while
--    reserved_until was anchored at RESERVATION creation. A buyer who reserved
--    at t0 and opened checkout at t0+20min got a Stripe session that outlived
--    the DB hold by 20 minutes; a payment landing in that gap hit a swept
--    reservation and was auto-refunded instead of fulfilled. /api/checkout now
--    calls this to re-anchor the hold to the same clock the session uses, so
--    the two windows genuinely cover each other. Abuse is bounded by the
--    per-reservation session rate limit in /api/checkout (3 per 5 minutes).
--
-- 2. complete_purchase_atomic: refuse to fulfill a group whose hold has
--    already lapsed. Without this, a reservation partially reclaimed by
--    reserve_cells_atomic's self-heal could be PARTIALLY fulfilled: the buyer
--    paid for N cells, the RPC sold the surviving subset, and nobody noticed
--    the difference. Now a lapsed hold returns the conflict reason and the
--    webhook's refund path makes the buyer whole. (The webhook additionally
--    cross-checks the paid amount against the delivered cell count as
--    defense in depth.)

-- ============================================================================
-- extend_reservation
-- ============================================================================
CREATE OR REPLACE FUNCTION extend_reservation(
  p_reservation_id uuid,
  p_ttl_seconds integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_extended_count integer;
BEGIN
  IF p_ttl_seconds IS NULL OR p_ttl_seconds <= 0 OR p_ttl_seconds > 7200 THEN
    RAISE EXCEPTION 'invalid ttl';
  END IF;

  UPDATE cells
  SET reserved_until = now() + make_interval(secs => p_ttl_seconds),
      updated_at = now()
  WHERE reservation_id = p_reservation_id
    AND status = 'reserved'
    -- Only a still-live hold can be extended: a lapsed one is already fair
    -- game for the sweeper/self-heal and must not be resurrected under a
    -- buyer who may have lost some of its cells.
    AND reserved_until > now();

  GET DIAGNOSTICS v_extended_count = ROW_COUNT;
  RETURN v_extended_count;
END;
$$;

REVOKE ALL ON FUNCTION extend_reservation(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION extend_reservation(uuid, integer)
  TO service_role;

-- ============================================================================
-- complete_purchase_atomic: lapsed-hold guard
-- ============================================================================
CREATE OR REPLACE FUNCTION complete_purchase_atomic(
  p_reservation_id uuid,
  p_stripe_session_id text,
  p_cell_price_cents integer DEFAULT 100
)
RETURNS TABLE (success boolean, reason text, cell_ids integer[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now CONSTANT timestamptz := now();
  v_all_ids integer[];
  v_reserved_ids integer[];
  v_lapsed_count integer;
  v_sold_same_session_ids integer[];
BEGIN
  -- Lock the whole reservation group up front, in id order, so this can
  -- never interleave badly with sweep_expired_reservations (which uses
  -- SKIP LOCKED and simply steps around rows locked here) or with a
  -- concurrent redelivery of the same webhook event.
  PERFORM 1 FROM cells WHERE reservation_id = p_reservation_id ORDER BY id FOR UPDATE;

  SELECT coalesce(array_agg(id ORDER BY id), ARRAY[]::integer[])
  INTO v_all_ids
  FROM cells
  WHERE reservation_id = p_reservation_id;

  IF cardinality(v_all_ids) = 0 THEN
    RETURN QUERY SELECT false, 'reservation_not_found_or_conflict'::text, ARRAY[]::integer[];
    RETURN;
  END IF;

  SELECT coalesce(array_agg(id ORDER BY id), ARRAY[]::integer[])
  INTO v_reserved_ids
  FROM cells
  WHERE reservation_id = p_reservation_id
    AND status = 'reserved';

  SELECT coalesce(array_agg(id ORDER BY id), ARRAY[]::integer[])
  INTO v_sold_same_session_ids
  FROM cells
  WHERE reservation_id = p_reservation_id
    AND status = 'sold'
    AND stripe_session_id = p_stripe_session_id;

  -- Idempotent webhook redelivery: every cell in the group is already sold
  -- under this exact session and none remain reserved or otherwise
  -- conflicting.
  IF cardinality(v_reserved_ids) = 0 AND cardinality(v_sold_same_session_ids) = cardinality(v_all_ids) THEN
    RETURN QUERY SELECT true, 'already_sold'::text, v_sold_same_session_ids;
    RETURN;
  END IF;

  -- Nothing left reserved under this reservation id, and it's not a clean
  -- already-sold replay either: the reservation expired and was swept,
  -- was already completed by a different session, or was otherwise
  -- disturbed. Surface whatever state exists so the caller can raise a
  -- payment_anomalies row instead of silently losing the payment.
  IF cardinality(v_reserved_ids) = 0 THEN
    RETURN QUERY SELECT false, 'reservation_not_found_or_conflict'::text, v_all_ids;
    RETURN;
  END IF;

  -- Lapsed-hold guard: if any surviving hold has expired, the group is fair
  -- game for the sweeper and may already be missing reclaimed cells. Selling
  -- the remainder would partially fulfill a fully-charged purchase, so refuse
  -- outright and let the caller's refund path make the buyer whole.
  SELECT count(*)
  INTO v_lapsed_count
  FROM cells
  WHERE id = ANY (v_reserved_ids)
    AND (reserved_until IS NULL OR reserved_until <= v_now);

  IF v_lapsed_count > 0 THEN
    RETURN QUERY SELECT false, 'reservation_not_found_or_conflict'::text, v_all_ids;
    RETURN;
  END IF;

  UPDATE cells
  SET status = 'sold',
      stripe_session_id = p_stripe_session_id,
      purchased_at = v_now,
      reserved_until = NULL,
      reserved_by_ip_hash = NULL,
      updated_at = v_now
  WHERE id = ANY (v_reserved_ids);

  UPDATE monument_stats
  SET sold_count = sold_count + cardinality(v_reserved_ids),
      total_cents = total_cents + (cardinality(v_reserved_ids) * p_cell_price_cents)
  WHERE id = true;

  -- One batched update grouped by tile, not a per-row loop.
  UPDATE tile_summary AS t
  SET sold_count = t.sold_count + touched.cell_count,
      last_purchased_at = v_now
  FROM (
    SELECT (x / 50) AS tile_x, (y / 50) AS tile_y, count(*) AS cell_count
    FROM cells
    WHERE id = ANY (v_reserved_ids)
    GROUP BY (x / 50), (y / 50)
  ) AS touched
  WHERE t.tile_x = touched.tile_x
    AND t.tile_y = touched.tile_y;

  RETURN QUERY SELECT true, 'processed'::text, v_reserved_ids;
END;
$$;

REVOKE ALL ON FUNCTION complete_purchase_atomic(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_purchase_atomic(uuid, text, integer)
  TO service_role;
