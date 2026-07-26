-- Word Monument - make the per-IP concurrent-hold cap authoritative under load
--
-- reserve_cells_atomic enforces a per-IP cap on concurrently-held reservations,
-- but it did so check-then-act: two concurrent calls from the same ip_hash
-- could each read the pre-increment hold count and both pass the cap, letting
-- one source hold more than the intended maximum (a grid-monopoly / DoS lever).
-- Take a transaction-scoped advisory lock keyed by the ip_hash as the first
-- statement so same-IP calls serialize through the cap check. Different IPs hash
-- to different lock keys and still run fully concurrently. The per-cell
-- FOR UPDATE that prevents double-sells is unchanged.
--
-- CREATE OR REPLACE keeps the existing 8-arg signature, REVOKE/GRANT, and all
-- callers intact; only the advisory lock is added.

CREATE OR REPLACE FUNCTION reserve_cells_atomic(
  p_cell_ids integer[],
  p_characters text[],
  p_reservation_id uuid,
  p_ip_hash text,
  p_background_color text DEFAULT NULL,
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
  -- Serialize concurrent reservations from the SAME ip_hash so the per-IP
  -- hold-count check below is authoritative (no check-then-act race). Held
  -- until the transaction ends; different IPs use different lock keys.
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
      background_color = p_background_color,
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

REVOKE ALL ON FUNCTION reserve_cells_atomic(integer[], text[], uuid, text, text, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_cells_atomic(integer[], text[], uuid, text, text, integer, integer, integer)
  TO service_role;
