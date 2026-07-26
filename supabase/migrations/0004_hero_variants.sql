-- Word Monument - hero A/B copy test
--
-- Tracks which homepage headline variant a visitor saw and whether it led to
-- a completed purchase, so the operator can see (in /admin) which emotional
-- framing actually converts and favor it. Variant copy lives in code
-- (src/lib/hero/variants.ts); these tables only hold counts + the per-
-- reservation attribution link. No buyer cookies - assignment is client
-- sessionStorage; the variant travels to purchase via the reservation.

CREATE TABLE hero_variant_stats (
  variant_id text PRIMARY KEY,
  impressions bigint NOT NULL DEFAULT 0,
  conversions bigint NOT NULL DEFAULT 0,
  cells_sold bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Links a reservation to the hero variant the buyer saw, so a completed
-- purchase can be credited to the right variant at webhook time.
CREATE TABLE reservation_hero_variant (
  reservation_id uuid PRIMARY KEY,
  variant_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Deny-all: these are internal analytics, never read/written by the browser.
ALTER TABLE hero_variant_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_hero_variant ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hero_variant_stats FROM anon, authenticated;
REVOKE ALL ON reservation_hero_variant FROM anon, authenticated;

-- Increment impressions for a variant (called once per session via a beacon).
CREATE OR REPLACE FUNCTION record_hero_impression(p_variant_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO hero_variant_stats (variant_id, impressions, updated_at)
  VALUES (p_variant_id, 1, now())
  ON CONFLICT (variant_id)
  DO UPDATE SET impressions = hero_variant_stats.impressions + 1, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION record_hero_impression(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_hero_impression(text) TO service_role;

-- Remember which variant a reservation came from (best-effort, idempotent).
CREATE OR REPLACE FUNCTION store_reservation_variant(p_reservation_id uuid, p_variant_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO reservation_hero_variant (reservation_id, variant_id)
  VALUES (p_reservation_id, p_variant_id)
  ON CONFLICT (reservation_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION store_reservation_variant(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store_reservation_variant(uuid, text) TO service_role;

-- Credit a completed purchase to the reservation's variant. Called ONLY on the
-- first ('processed') webhook completion (not on idempotent redelivery), so
-- conversions never double-count.
CREATE OR REPLACE FUNCTION record_hero_conversion(p_reservation_id uuid, p_cell_count integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_variant text;
BEGIN
  SELECT variant_id INTO v_variant FROM reservation_hero_variant WHERE reservation_id = p_reservation_id;
  IF v_variant IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO hero_variant_stats (variant_id, conversions, cells_sold, updated_at)
  VALUES (v_variant, 1, greatest(p_cell_count, 0), now())
  ON CONFLICT (variant_id)
  DO UPDATE SET conversions = hero_variant_stats.conversions + 1,
                cells_sold = hero_variant_stats.cells_sold + greatest(p_cell_count, 0),
                updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION record_hero_conversion(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_hero_conversion(uuid, integer) TO service_role;
