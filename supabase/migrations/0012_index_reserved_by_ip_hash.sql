-- Word Monument - index the per-IP hold lookup
--
-- reserve_cells_atomic counts a connection's existing holds on every single
-- reservation attempt:
--
--   SELECT count(*) FROM cells WHERE reserved_by_ip_hash = ... AND status = 'reserved'
--
-- cells has 1,000,000 rows and no index on reserved_by_ip_hash, so that count
-- falls back to a scan, and it runs INSIDE the per-IP advisory lock: every
-- extra millisecond is time no other reservation from that connection can
-- proceed. Under a launch spike that is exactly the wrong place to be slow.
--
-- Partial on status = 'reserved' to match how it is queried and to keep the
-- index tiny (only live holds, never the millions of available or sold rows),
-- mirroring idx_cells_reserved_until from 0001.

CREATE INDEX IF NOT EXISTS idx_cells_reserved_by_ip_hash
  ON cells (reserved_by_ip_hash)
  WHERE status = 'reserved';
