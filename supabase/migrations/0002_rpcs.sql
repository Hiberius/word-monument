-- Word Monument - RPCs
--
-- All six functions are SECURITY DEFINER plpgsql with a locked search_path,
-- and every one is immediately revoked from PUBLIC/anon/authenticated and
-- granted to service_role only. None of them are ever callable from the
-- browser - they exist purely for server code to invoke via
-- supabase.rpc(...) using the service-role key. Preventing double-sells is
-- the single most important property of this whole schema, so every
-- mutating function locks its candidate rows explicitly before checking
-- state, rather than relying on the calling isolation level alone.

-- ============================================================================
-- reserve_cells_atomic
--
-- Places a temporary hold on a batch of cells for checkout. Fails closed:
-- if ANY candidate cell is unavailable, nothing is reserved and the caller
-- gets back the list of ids to show as taken.
-- ============================================================================
CREATE OR REPLACE FUNCTION reserve_cells_atomic(
  p_cell_ids integer[],
  p_characters text[],
  p_reservation_id uuid,
  p_ip_hash text,
  p_ttl_seconds integer DEFAULT 2100,
  p_max_cells_per_tx integer DEFAULT 300,
  p_max_concurrent_cells_per_ip integer DEFAULT 300
)
RETURNS TABLE (success boolean, unavailable_cell_ids integer[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now CONSTANT timestamptz := now();
  v_request_count integer;
  v_distinct_count integer;
  v_existing_count integer;
  v_ip_current_holds integer;
  v_unavailable integer[];
BEGIN
  v_request_count := coalesce(cardinality(p_cell_ids), 0);

  IF v_request_count = 0 THEN
    RAISE EXCEPTION 'p_cell_ids must be a non-empty array';
  END IF;

  IF v_request_count > p_max_cells_per_tx THEN
    RAISE EXCEPTION 'requested % cells exceeds max % per transaction', v_request_count, p_max_cells_per_tx;
  END IF;

  IF coalesce(cardinality(p_characters), 0) <> v_request_count THEN
    RAISE EXCEPTION 'p_characters length (%) does not match p_cell_ids length (%)',
      coalesce(cardinality(p_characters), 0), v_request_count;
  END IF;

  SELECT count(DISTINCT c) INTO v_distinct_count FROM unnest(p_cell_ids) AS c;
  IF v_distinct_count <> v_request_count THEN
    RAISE EXCEPTION 'p_cell_ids contains duplicate ids';
  END IF;

  SELECT count(*) INTO v_existing_count FROM cells WHERE id = ANY (p_cell_ids);
  IF v_existing_count <> v_request_count THEN
    RAISE EXCEPTION 'one or more cell ids do not exist (expected %, found %)', v_request_count, v_existing_count;
  END IF;

  -- Per-IP concurrent-hold cap. Cells whose reservation has already lapsed
  -- (reserved_until in the past) don't count - they're logically available
  -- even before the sweep cron reaches them.
  SELECT count(*) INTO v_ip_current_holds
  FROM cells
  WHERE reserved_by_ip_hash = p_ip_hash
    AND status = 'reserved'
    AND reserved_until > v_now;

  IF v_ip_current_holds + v_request_count > p_max_concurrent_cells_per_ip THEN
    RAISE EXCEPTION 'per-ip concurrent reservation cap exceeded (% held + % requested > % max)',
      v_ip_current_holds, v_request_count, p_max_concurrent_cells_per_ip;
  END IF;

  -- Lock every candidate row up front, in ascending id order. Two
  -- overlapping concurrent requests both locking in id order can never
  -- deadlock each other - whichever acquires the lower id first proceeds,
  -- the other blocks until released.
  PERFORM 1 FROM cells WHERE id = ANY (p_cell_ids) ORDER BY id FOR UPDATE;

  -- Self-heal: a reservation whose TTL has passed is logically available
  -- even if the sweep cron hasn't reached it yet. Reclaim it now so this
  -- request can use it instead of failing on a stale hold.
  UPDATE cells
  SET status = 'available',
      character = NULL,
      reservation_id = NULL,
      reserved_until = NULL,
      reserved_by_ip_hash = NULL,
      owner_label = NULL,
      updated_at = v_now
  WHERE id = ANY (p_cell_ids)
    AND status = 'reserved'
    AND reserved_until < v_now;

  SELECT coalesce(array_agg(id ORDER BY id), ARRAY[]::integer[])
  INTO v_unavailable
  FROM cells
  WHERE id = ANY (p_cell_ids)
    AND status <> 'available';

  IF cardinality(v_unavailable) > 0 THEN
    RETURN QUERY SELECT false, v_unavailable;
    RETURN;
  END IF;

  UPDATE cells AS c
  SET status = 'reserved',
      character = req.character,
      reservation_id = p_reservation_id,
      reserved_until = v_now + make_interval(secs => p_ttl_seconds),
      reserved_by_ip_hash = p_ip_hash,
      updated_at = v_now
  FROM (
    SELECT unnest(p_cell_ids) AS id, unnest(p_characters) AS character
  ) AS req
  WHERE c.id = req.id;

  RETURN QUERY SELECT true, ARRAY[]::integer[];
END;
$$;

REVOKE ALL ON FUNCTION reserve_cells_atomic(integer[], text[], uuid, text, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_cells_atomic(integer[], text[], uuid, text, integer, integer, integer)
  TO service_role;

-- ============================================================================
-- complete_purchase_atomic
--
-- Called from the Stripe checkout.session.completed webhook. Idempotent
-- against redelivery: replaying the same session after it already
-- succeeded returns success with reason 'already_sold' instead of erroring
-- or re-charging monument_stats/tile_summary.
--
-- p_cell_price_cents is passed explicitly by the caller (sourced from
-- CELL_PRICE_CENTS in src/lib/config.ts) rather than hardcoded here, so the
-- publicly-displayed revenue total can't silently drift from the
-- app's actual pricing if it's ever changed. The DEFAULT exists only as a
-- safety fallback for direct/manual SQL invocation, not something app code
-- should rely on.
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

-- ============================================================================
-- release_reservation
--
-- Called from the Stripe checkout.session.expired webhook (and anywhere
-- else a reservation needs to be explicitly abandoned before its TTL).
-- ============================================================================
CREATE OR REPLACE FUNCTION release_reservation(p_reservation_id uuid)
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
    AND status = 'reserved';

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  RETURN v_released_count;
END;
$$;

REVOKE ALL ON FUNCTION release_reservation(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION release_reservation(uuid)
  TO service_role;

-- ============================================================================
-- sweep_expired_reservations
--
-- Cron-driven cleanup for reservations nobody explicitly released (browser
-- closed mid-checkout, webhook lost, etc). Uses SKIP LOCKED so it never
-- blocks on - or deadlocks against - a webhook that's mid-completion on an
-- overlapping set of rows; it just picks up whatever isn't currently held
-- and leaves the rest for the next run.
-- ============================================================================
CREATE OR REPLACE FUNCTION sweep_expired_reservations(p_batch_limit integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released_count integer;
BEGIN
  WITH candidates AS (
    SELECT id
    FROM cells
    WHERE status = 'reserved'
      AND reserved_until < now()
    ORDER BY id
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE cells AS c
  SET status = 'available',
      character = NULL,
      reservation_id = NULL,
      reserved_until = NULL,
      reserved_by_ip_hash = NULL,
      owner_label = NULL,
      updated_at = now()
  FROM candidates
  WHERE c.id = candidates.id;

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  RETURN v_released_count;
END;
$$;

REVOKE ALL ON FUNCTION sweep_expired_reservations(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sweep_expired_reservations(integer)
  TO service_role;

-- ============================================================================
-- remove_cell_atomic
--
-- Admin moderation action: takes a sold cell's character down (e.g. after
-- a confirmed report) without un-selling it - the purchase stands, the
-- content doesn't.
-- ============================================================================
CREATE OR REPLACE FUNCTION remove_cell_atomic(
  p_cell_id integer,
  p_admin_email text,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_moderation_status text;
BEGIN
  SELECT status, moderation_status
  INTO v_status, v_moderation_status
  FROM cells
  WHERE id = p_cell_id
  FOR UPDATE;

  IF NOT FOUND OR v_status <> 'sold' THEN
    RETURN false;
  END IF;

  IF v_moderation_status = 'removed' THEN
    RETURN true; -- idempotent no-op: already removed
  END IF;

  UPDATE cells
  SET character = NULL,
      moderation_status = 'removed',
      updated_at = now()
  WHERE id = p_cell_id;

  INSERT INTO moderation_actions (cell_id, action, admin_email, reason)
  VALUES (p_cell_id, 'removed', p_admin_email, p_reason);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION remove_cell_atomic(integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION remove_cell_atomic(integer, text, text)
  TO service_role;

-- ============================================================================
-- report_cell
--
-- Public-facing "report this cell" action, called from server code (never
-- directly from the browser). One report per (cell, ip) via the unique
-- constraint on cell_reports; auto-flags a cell once distinct reports
-- reach the threshold, but never downgrades an already-flagged/removed
-- cell back to flagged.
-- ============================================================================
CREATE OR REPLACE FUNCTION report_cell(
  p_cell_id integer,
  p_reason text,
  p_ip_hash text,
  p_auto_flag_threshold integer DEFAULT 3
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_count integer;
  v_new_reported_count integer;
BEGIN
  INSERT INTO cell_reports (cell_id, reason, reporter_ip_hash)
  VALUES (p_cell_id, p_reason, p_ip_hash)
  ON CONFLICT (cell_id, reporter_ip_hash) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  IF v_inserted_count = 0 THEN
    RETURN false;
  END IF;

  UPDATE cells
  SET reported_count = reported_count + 1
  WHERE id = p_cell_id
  RETURNING reported_count INTO v_new_reported_count;

  IF v_new_reported_count >= p_auto_flag_threshold THEN
    UPDATE cells
    SET moderation_status = 'flagged'
    WHERE id = p_cell_id
      AND moderation_status = 'clear';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION report_cell(integer, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION report_cell(integer, text, text, integer)
  TO service_role;
