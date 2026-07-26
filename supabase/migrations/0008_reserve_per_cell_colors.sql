-- Word Monument - per-CELL background colors
--
-- A buyer can now color their inscription letter by letter, so the reserve RPC
-- takes an ARRAY of colors (aligned by index with p_cell_ids) instead of a
-- single p_background_color. The reserve endpoint validates each color id
-- against the curated palette and passes the resolved hexes here, so only
-- approved, on-brand colors ever reach the grid. Glyph color is still derived
-- from each background's luminance at render time.
--
-- The 5th parameter's TYPE changes (text -> text[]), so the previous 8-arg
-- signature must be dropped and recreated. Keeps the per-IP advisory lock and
-- FOR UPDATE double-sell protection from 0007 unchanged.

DROP FUNCTION IF EXISTS reserve_cells_atomic(integer[], text[], uuid, text, text, integer, integer, integer);

CREATE OR REPLACE FUNCTION reserve_cells_atomic(
  p_cell_ids integer[],
  p_characters text[],
  p_reservation_id uuid,
  p_ip_hash text,
  p_background_colors text[] DEFAULT NULL,
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
  v_colors text[];
BEGIN
  -- Serialize concurrent reservations from the SAME ip_hash so the per-IP
  -- hold-count check below is authoritative (no check-then-act race).
  IF p_ip_hash IS NOT NULL AND length(p_ip_hash) > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));
  END IF;

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

  -- Colors are optional; when omitted, default every cell to NULL (ink at render).
  v_colors := coalesce(p_background_colors, array_fill(NULL::text, ARRAY[v_request_count]));
  IF cardinality(v_colors) <> v_request_count THEN
    RAISE EXCEPTION 'p_background_colors length (%) does not match p_cell_ids length (%)',
      cardinality(v_colors), v_request_count;
  END IF;

  SELECT count(DISTINCT c) INTO v_distinct_count FROM unnest(p_cell_ids) AS c;
  IF v_distinct_count <> v_request_count THEN
    RAISE EXCEPTION 'p_cell_ids contains duplicate ids';
  END IF;

  SELECT count(*) INTO v_existing_count FROM cells WHERE id = ANY (p_cell_ids);
  IF v_existing_count <> v_request_count THEN
    RAISE EXCEPTION 'one or more cell ids do not exist (expected %, found %)', v_request_count, v_existing_count;
  END IF;

  -- Per-IP concurrent-hold cap (lapsed reservations don't count).
  SELECT count(*) INTO v_ip_current_holds
  FROM cells
  WHERE reserved_by_ip_hash = p_ip_hash
    AND status = 'reserved'
    AND reserved_until > v_now;

  IF v_ip_current_holds + v_request_count > p_max_concurrent_cells_per_ip THEN
    RAISE EXCEPTION 'per-ip concurrent reservation cap exceeded (% held + % requested > % max)',
      v_ip_current_holds, v_request_count, p_max_concurrent_cells_per_ip;
  END IF;

  -- Lock candidates in ascending id order (deadlock-safe).
  PERFORM 1 FROM cells WHERE id = ANY (p_cell_ids) ORDER BY id FOR UPDATE;

  -- Self-heal lapsed reservations back to available before checking.
  UPDATE cells
  SET status = 'available',
      character = NULL,
      background_color = NULL,
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
      background_color = req.background_color,
      reservation_id = p_reservation_id,
      reserved_until = v_now + make_interval(secs => p_ttl_seconds),
      reserved_by_ip_hash = p_ip_hash,
      updated_at = v_now
  FROM (
    SELECT unnest(p_cell_ids) AS id,
           unnest(p_characters) AS character,
           unnest(v_colors) AS background_color
  ) AS req
  WHERE c.id = req.id;

  RETURN QUERY SELECT true, ARRAY[]::integer[];
END;
$$;

REVOKE ALL ON FUNCTION reserve_cells_atomic(integer[], text[], uuid, text, text[], integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_cells_atomic(integer[], text[], uuid, text, text[], integer, integer, integer)
  TO service_role;
