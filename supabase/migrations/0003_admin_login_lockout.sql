-- Word Monument - admin login lockout
--
-- The KV-backed rate limiter (src/lib/security/rate-limit-kv.ts) fails OPEN
-- on a missing binding or KV error, and does an unsynchronized get-then-put
-- with no compare-and-swap, so a burst of concurrent requests can all read
-- the same stale count and all be allowed through. For most endpoints that's
-- an acceptable availability trade-off. For /admin/session - the single
-- shared-password gate to the entire moderation console, with no
-- per-admin identity or second factor - it is not: a KV
-- outage would otherwise leave the login endpoint completely unthrottled.
--
-- This table is a KV-independent backstop, atomic via ordinary row locking
-- (the same FOR UPDATE pattern used everywhere else in this schema), which
-- serializes concurrent login attempts instead of racing a non-atomic KV
-- read-modify-write.

CREATE TABLE admin_login_state (
  id boolean PRIMARY KEY DEFAULT true,
  failed_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_login_state_single_row CHECK (id = true)
);

INSERT INTO admin_login_state (id) VALUES (true);

ALTER TABLE admin_login_state ENABLE ROW LEVEL SECURITY;
-- No policies, no GRANT SELECT - this table has no public read surface at
-- all (unlike monument_stats/tile_summary), it's purely an internal counter.
REVOKE ALL ON admin_login_state FROM anon, authenticated;

-- ============================================================================
-- admin_login_attempt
--
-- Called once per POST /admin/session, AFTER bcrypt.compare has already run
-- (so a correct-but-locked-out password is still rejected - once locked,
-- nothing gets through until the lockout window passes, not even the right
-- password). Locks the single row up front, which naturally serializes
-- concurrent calls: a burst of parallel login attempts processes one at a
-- time through this function rather than all reading the same pre-increment
-- count the way the KV rate limiter can.
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_login_attempt(
  p_password_valid boolean,
  p_max_failed integer DEFAULT 10,
  p_lockout_seconds integer DEFAULT 900
)
RETURNS TABLE (allowed boolean, locked_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now CONSTANT timestamptz := now();
  v_row admin_login_state%ROWTYPE;
  v_new_count integer;
  v_new_locked_until timestamptz;
BEGIN
  SELECT * INTO v_row FROM admin_login_state WHERE id = true FOR UPDATE;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
    RETURN QUERY SELECT false, v_row.locked_until;
    RETURN;
  END IF;

  IF p_password_valid THEN
    UPDATE admin_login_state
    SET failed_count = 0, locked_until = NULL, updated_at = v_now
    WHERE id = true;
    RETURN QUERY SELECT true, NULL::timestamptz;
    RETURN;
  END IF;

  v_new_count := v_row.failed_count + 1;
  v_new_locked_until := NULL;
  IF v_new_count >= p_max_failed THEN
    v_new_locked_until := v_now + make_interval(secs => p_lockout_seconds);
  END IF;

  UPDATE admin_login_state
  SET failed_count = v_new_count, locked_until = v_new_locked_until, updated_at = v_now
  WHERE id = true;

  -- allowed=true here means "this attempt was processed" (the password was
  -- simply wrong), not "login succeeded" - the caller already knows
  -- p_password_valid was false. allowed=false only ever means "currently
  -- locked out", which only happens on the branch above.
  RETURN QUERY SELECT true, v_new_locked_until;
END;
$$;

REVOKE ALL ON FUNCTION admin_login_attempt(boolean, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_login_attempt(boolean, integer, integer)
  TO service_role;
