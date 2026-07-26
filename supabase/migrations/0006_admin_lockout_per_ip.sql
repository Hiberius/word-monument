-- Word Monument - admin login lockout, re-keyed PER CLIENT (fixes a global DoS)
--
-- The original admin_login_state (0003) was a single global singleton row, so
-- any unauthenticated attacker could trip the lockout and keep it re-armed with
-- one wrong-password POST per window, permanently locking out the real operator
-- from the sole moderation console - even with the correct password.
-- Re-key the backstop by hashed IP: an attacker can now only lock out their own
-- source. Per-IP brute-force protection is preserved (still atomic via row
-- locking, still KV-independent); the global denial-of-service is removed.

DROP FUNCTION IF EXISTS admin_login_attempt(boolean, integer, integer);
DROP TABLE IF EXISTS admin_login_state;

CREATE TABLE admin_login_ip_state (
  ip_hash text PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_login_ip_state ENABLE ROW LEVEL SECURITY;
-- Internal counter only - no public read surface, no GRANT SELECT.
REVOKE ALL ON admin_login_ip_state FROM anon, authenticated;

CREATE OR REPLACE FUNCTION admin_login_attempt(
  p_ip_hash text,
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
  v_row admin_login_ip_state%ROWTYPE;
  v_new_count integer;
  v_new_locked_until timestamptz;
BEGIN
  IF p_ip_hash IS NULL OR length(p_ip_hash) = 0 THEN
    RAISE EXCEPTION 'p_ip_hash is required';
  END IF;

  -- Opportunistic prune so the table can't grow unbounded across many IPs.
  DELETE FROM admin_login_ip_state
  WHERE updated_at < v_now - interval '1 day'
    AND (locked_until IS NULL OR locked_until < v_now);

  INSERT INTO admin_login_ip_state (ip_hash) VALUES (p_ip_hash)
  ON CONFLICT (ip_hash) DO NOTHING;
  SELECT * INTO v_row FROM admin_login_ip_state WHERE ip_hash = p_ip_hash FOR UPDATE;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
    RETURN QUERY SELECT false, v_row.locked_until;
    RETURN;
  END IF;

  IF p_password_valid THEN
    UPDATE admin_login_ip_state
    SET failed_count = 0, locked_until = NULL, updated_at = v_now
    WHERE ip_hash = p_ip_hash;
    RETURN QUERY SELECT true, NULL::timestamptz;
    RETURN;
  END IF;

  -- Wrong password. If a prior lock window has already elapsed, start the count
  -- fresh rather than compounding a stale count - this removes the old
  -- "one wrong attempt per window re-locks forever" behaviour.
  IF v_row.locked_until IS NOT NULL AND v_row.locked_until <= v_now THEN
    v_new_count := 1;
  ELSE
    v_new_count := v_row.failed_count + 1;
  END IF;

  v_new_locked_until := NULL;
  IF v_new_count >= p_max_failed THEN
    v_new_locked_until := v_now + make_interval(secs => p_lockout_seconds);
  END IF;

  UPDATE admin_login_ip_state
  SET failed_count = v_new_count, locked_until = v_new_locked_until, updated_at = v_now
  WHERE ip_hash = p_ip_hash;

  -- allowed=true means "processed" (password was simply wrong); allowed=false
  -- only ever means "currently locked out" (the branch above).
  RETURN QUERY SELECT true, v_new_locked_until;
END;
$$;

REVOKE ALL ON FUNCTION admin_login_attempt(text, boolean, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_login_attempt(text, boolean, integer, integer)
  TO service_role;
