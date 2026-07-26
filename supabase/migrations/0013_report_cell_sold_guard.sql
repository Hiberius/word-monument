-- Word Monument - report_cell only accepts reports against sold cells
--
-- report_cell used to accept a report for any existing cell id, including
-- available and reserved ones, and reserve_cells_atomic never resets
-- moderation state when a cell changes hands. So an attacker could pre-load
-- empty cells with reports:
--
--   1. report the same available cell from N distinct IPs
--   2. reported_count crosses the auto-flag threshold, moderation_status
--      becomes 'flagged' on a cell nobody has ever bought
--   3. someone later buys that cell and their inscription lands already
--      flagged, sitting in the admin moderation queue from the moment it
--      goes live
--
-- Refusing reports on anything that is not currently sold closes the window:
-- there is no content to report until a purchase completes, and by then the
-- cell is a real target with a real owner. Everything else about the function
-- (per-IP uniqueness, the counter bump, the never-downgrade auto-flag) is
-- unchanged.

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
  v_status text;
  v_inserted_count integer;
  v_new_reported_count integer;
BEGIN
  SELECT status INTO v_status
  FROM cells
  WHERE id = p_cell_id;

  IF NOT FOUND OR v_status <> 'sold' THEN
    RETURN false;
  END IF;

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
