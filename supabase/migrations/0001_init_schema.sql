-- Word Monument - initial schema
-- 1,000,000 cells ($1 each), a public-facing permanent monument.
-- This migration creates every base table, seeds the full 1000x1000 grid,
-- and locks down direct table access so only a service-role backend (or the
-- explicit cells_public view) can ever touch real rows.

-- ============================================================================
-- Table: cells
-- One row per monument cell. id is precomputed as y*1000 + x so that a single
-- integer primary key also gives us a stable, sortable, human-debuggable
-- coordinate encoding without a composite key.
-- ============================================================================
CREATE TABLE cells (
  id integer PRIMARY KEY,
  x smallint NOT NULL,
  y smallint NOT NULL,

  -- Not char(1): a curated emoji can be 2+ codepoints (heart + variation
  -- selector, ZWJ sequences, flags). "One character" is enforced in
  -- application code via an exact-match allow-list, not a DB length
  -- constraint, because Postgres string length is codepoint-based and would
  -- reject or mismeasure legitimate multi-codepoint emoji.
  character text,

  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'sold')),

  -- Groups cells bought together. SURVIVES the sale (never cleared on
  -- purchase), so it doubles as the purchase-grouping key for success pages,
  -- highlights, and receipts - there is no separate purchases table.
  reservation_id uuid,
  reserved_until timestamptz,
  reserved_by_ip_hash text,

  -- Support/debug lookup ONLY - never the completion join key. Stripe
  -- metadata is capped at 500 chars and a 300-cell id list can exceed that,
  -- so reservation_id (not this column) is what complete_purchase_atomic
  -- joins on.
  stripe_session_id text,

  owner_label text,
  purchased_at timestamptz,

  moderation_status text NOT NULL DEFAULT 'clear'
    CHECK (moderation_status IN ('clear', 'flagged', 'removed')),
  moderation_flags jsonb,

  -- NULL means the OpenAI layer-2 check has not run yet; this is what drives
  -- the moderation-sweep retry cron (see idx_cells_moderation_pending).
  moderation_checked_at timestamptz,
  reported_count integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cells_xy_unique UNIQUE (x, y),
  CONSTRAINT cells_xy_range CHECK (x BETWEEN 0 AND 999 AND y BETWEEN 0 AND 999)
);

CREATE INDEX idx_cells_x_y ON cells (x, y);
CREATE INDEX idx_cells_reservation_id ON cells (reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX idx_cells_reserved_until ON cells (reserved_until) WHERE status = 'reserved';
CREATE INDEX idx_cells_moderation_pending ON cells (id) WHERE status = 'sold' AND moderation_checked_at IS NULL;

-- ============================================================================
-- Table: tile_summary
-- 400 rows (20x20 tiles of 50x50 cells). Updated explicitly by
-- complete_purchase_atomic in a single batched statement per purchase - not
-- a per-row trigger - to keep purchase completion cheap and predictable.
-- ============================================================================
CREATE TABLE tile_summary (
  tile_x smallint NOT NULL,
  tile_y smallint NOT NULL,
  sold_count int NOT NULL DEFAULT 0,
  last_purchased_at timestamptz,
  PRIMARY KEY (tile_x, tile_y)
);

-- ============================================================================
-- Table: monument_stats
-- Single-row global counters. The boolean primary key with a fixed default
-- of true is a standard Postgres trick to enforce "exactly one row".
-- ============================================================================
CREATE TABLE monument_stats (
  id boolean PRIMARY KEY DEFAULT true,
  sold_count int NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL DEFAULT 0
);

-- ============================================================================
-- Table: stripe_webhook_events
-- Dedup/audit trail for inbound Stripe webhook deliveries.
-- ============================================================================
CREATE TABLE stripe_webhook_events (
  stripe_event_id text PRIMARY KEY,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- ============================================================================
-- Table: cell_reports
-- One report per (cell, reporter) - the unique constraint is what makes
-- report_cell's ON CONFLICT DO NOTHING idempotent per IP.
-- ============================================================================
CREATE TABLE cell_reports (
  id bigserial PRIMARY KEY,
  cell_id integer NOT NULL REFERENCES cells (id),
  reason text,
  reporter_ip_hash text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cell_reports_unique_reporter UNIQUE (cell_id, reporter_ip_hash)
);

CREATE INDEX idx_cell_reports_open ON cell_reports (cell_id) WHERE status = 'open';

-- ============================================================================
-- Table: moderation_actions
-- Audit trail of admin moderation decisions.
-- ============================================================================
CREATE TABLE moderation_actions (
  id bigserial PRIMARY KEY,
  cell_id integer NOT NULL REFERENCES cells (id),
  action text NOT NULL CHECK (action IN ('removed', 'flag_cleared')),
  admin_email text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Table: payment_anomalies
-- Anything complete_purchase_atomic (or the webhook handler around it)
-- flags as unexpected - conflicting cell state, refund needed, etc.
-- Service-role/admin only, never exposed publicly.
-- ============================================================================
CREATE TABLE payment_anomalies (
  id bigserial PRIMARY KEY,
  stripe_session_id text NOT NULL,
  reservation_id uuid,
  conflicted_cell_ids integer[],
  refund_id text,
  refund_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

-- ============================================================================
-- Row Level Security
--
-- Deny-all on every base table below: RLS is enabled and NO policies are
-- added, so anon/authenticated are denied by default on every operation
-- (service_role bypasses RLS automatically and is the only way in from
-- server code).
--
-- Public read access is exposed through an explicit column-allowlist VIEW
-- (cells_public), never a row policy on the base table. That way a future
-- column added to cells (e.g. reserved_by_ip_hash, stripe_session_id)
-- stays invisible to anon by default instead of silently leaking through a
-- permissive "select *" policy.
-- ============================================================================
ALTER TABLE cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE tile_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE monument_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cell_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_anomalies ENABLE ROW LEVEL SECURITY;

CREATE VIEW cells_public AS
  SELECT id, x, y, status, character, updated_at
  FROM cells;

-- Strip whatever default privileges Supabase's project bootstrap may have
-- granted anon/authenticated on new public-schema tables (it grants broadly
-- by default) - belt-and-braces on top of RLS's own deny-all. Every
-- publicly-readable table gets this REVOKE-then-GRANT-SELECT-only pair, not
-- just `cells` - tile_summary/monument_stats were previously missed here,
-- which left them writable via the anon key despite RLS being the intended
-- gate (RLS alone does not revoke pre-existing table-level GRANTs).
REVOKE ALL ON cells FROM anon, authenticated;
REVOKE ALL ON tile_summary FROM anon, authenticated;
REVOKE ALL ON monument_stats FROM anon, authenticated;

-- The view needs the same treatment as the tables. Supabase's bootstrap
-- default privileges cover views, cells_public is a single-table projection so
-- Postgres makes it auto-updatable, and a view without security_invoker runs
-- DML as its OWNER, which bypasses the deny-all RLS on cells entirely. Without
-- this REVOKE the public anon key could PATCH or DELETE every paid cell.
REVOKE ALL ON cells_public FROM anon, authenticated;

GRANT SELECT ON cells_public TO anon, authenticated;
GRANT SELECT ON tile_summary, monument_stats TO anon, authenticated;

-- RLS is enabled on these two with no policy, and a table GRANT does not
-- satisfy RLS: without an explicit SELECT policy every anon read returns zero
-- rows and the homepage counters and zoomed-out grid render empty. Both hold
-- only public aggregates (per-tile sold counts, global totals), so reading all
-- rows is intended. No write policy exists, so RLS still denies every write.
CREATE POLICY tile_summary_public_read
  ON tile_summary FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY monument_stats_public_read
  ON monument_stats FOR SELECT TO anon, authenticated USING (true);

-- ============================================================================
-- Seed: 1,000,000 cells (1000 x 1000 grid) + 400 tile_summary rows.
--
-- Inserted in bands of 50 y-rows (50 * 1000 = 50,000 rows per statement)
-- rather than one giant INSERT, to stay safely under a hosted-Postgres
-- statement timeout - statement_timeout is enforced per statement, so 20
-- smaller INSERTs are far safer than one 1M-row INSERT even though they all
-- still run inside this migration's single transaction.
-- ============================================================================
DO $$
DECLARE
  band_start integer;
  band_height CONSTANT integer := 50;
BEGIN
  FOR band_start IN 0..950 BY band_height LOOP
    INSERT INTO cells (id, x, y)
    SELECT y * 1000 + x, x, y
    FROM generate_series(band_start, band_start + band_height - 1) AS y
    CROSS JOIN generate_series(0, 999) AS x;
  END LOOP;
END $$;

INSERT INTO tile_summary (tile_x, tile_y, sold_count, last_purchased_at)
SELECT tx, ty, 0, NULL
FROM generate_series(0, 19) AS tx
CROSS JOIN generate_series(0, 19) AS ty;

INSERT INTO monument_stats (id, sold_count, total_cents)
VALUES (true, 0, 0);
