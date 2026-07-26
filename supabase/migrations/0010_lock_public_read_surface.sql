-- Word Monument - lock down the public (anon key) read surface
--
-- Two defects, both only visible on a real Supabase project, because they are
-- caused by Supabase's own project bootstrap:
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated
--
-- 1. CRITICAL - that default privilege covers VIEWS too, so cells_public was
--    created with INSERT/UPDATE/DELETE for anon. cells_public is a simple
--    single-table projection, so Postgres makes it auto-updatable, and it was
--    created without security_invoker, so DML through it runs as the view
--    OWNER and bypasses the deny-all RLS on cells. PostgREST exposes PATCH and
--    DELETE on auto-updatable views, so anyone holding the anon key (which
--    ships in the browser bundle by design) could erase every paid inscription
--    with a single request. Reproduced against Postgres 17: an UPDATE issued
--    as anon reset a sold cell to available and blanked its character.
--
--    0001 revoked the blanket grant on the three base tables but not on the
--    view, which is the gap this closes.
--
-- 2. HIGH - tile_summary and monument_stats have RLS enabled (0001) and no
--    policy, so a table-level GRANT SELECT is not enough: every anon read
--    returns zero rows. In production the homepage counters would read 0 sold
--    and $0, and the zoomed-out grid tiers would render empty, on a site that
--    was actually selling. These two tables hold nothing private (per-tile
--    sold counts and global totals are displayed to everyone), so a
--    read-everything SELECT policy is the correct grant.
--
-- Safe to re-run: every statement is idempotent.

-- ---------------------------------------------------------------------------
-- 1. The public view is READ ONLY.
-- ---------------------------------------------------------------------------
REVOKE ALL ON cells_public FROM anon, authenticated;
GRANT SELECT ON cells_public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Strip the bootstrap's blanket grants from every table that is meant to be
--    server-only. RLS already denies these, but matching 0001's
--    REVOKE-then-grant-nothing pattern keeps the privilege list honest and
--    means a future policy can never accidentally open a write path.
-- ---------------------------------------------------------------------------
REVOKE ALL ON cell_reports FROM anon, authenticated;
REVOKE ALL ON moderation_actions FROM anon, authenticated;
REVOKE ALL ON payment_anomalies FROM anon, authenticated;
REVOKE ALL ON stripe_webhook_events FROM anon, authenticated;
REVOKE ALL ON admin_login_ip_state FROM anon, authenticated;
REVOKE ALL ON hero_variant_stats FROM anon, authenticated;
REVOKE ALL ON reservation_hero_variant FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Let the public actually read the two public-by-design counter tables.
--    SELECT only: no INSERT/UPDATE/DELETE policy exists, so RLS keeps denying
--    writes even though the tables are readable.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tile_summary_public_read ON tile_summary;
CREATE POLICY tile_summary_public_read
  ON tile_summary
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS monument_stats_public_read ON monument_stats;
CREATE POLICY monument_stats_public_read
  ON monument_stats
  FOR SELECT
  TO anon, authenticated
  USING (true);
