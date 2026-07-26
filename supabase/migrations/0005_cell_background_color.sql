-- Word Monument - per-inscription background color
--
-- Lets a buyer choose a background color for their inscription. The reserve
-- endpoint validates the chosen color id against a curated palette
-- (src/lib/monument/colors.ts) and passes the resolved hex here, so only
-- approved, on-brand colors ever reach the grid. The glyph color is derived
-- from the background's luminance at render time, so only the background hex
-- is stored.

ALTER TABLE cells ADD COLUMN background_color text;

-- Expose it on the public read surface. CREATE OR REPLACE VIEW does NOT work
-- here: Postgres only lets a replaced view append columns at the END, and this
-- inserts background_color before updated_at, which fails with "cannot change
-- name of view column updated_at to background_color" and aborts the whole
-- migration on a fresh database. Drop and recreate instead, which loses the
-- grant from 0001, so it is reapplied below.
DROP VIEW IF EXISTS cells_public;

CREATE VIEW cells_public AS
  SELECT id, x, y, status, character, background_color, updated_at
  FROM cells;

-- Recreating the view re-applies Supabase's blanket default privileges, so the
-- read-only lockdown from 0001 has to be repeated here: an auto-updatable view
-- without security_invoker lets anon DML through as the view owner, bypassing
-- the deny-all RLS on cells.
REVOKE ALL ON cells_public FROM anon, authenticated;
GRANT SELECT ON cells_public TO anon, authenticated;

-- Recreate reserve_cells_atomic with a background-color parameter. Drop the
-- prior 7-arg signature first so there is exactly one version.
DROP FUNCTION IF EXISTS reserve_cells_atomic(integer[], text[], uuid, text, integer, integer, integer);

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
