export const GRID_SIZE = 1000
export const CELL_PRICE_CENTS = 100
export const MAX_CELLS_PER_TX = 300
export const MAX_CONCURRENT_CELLS_PER_IP = 300
export const RESERVATION_TTL_SECONDS = 2100
// Slack added to the DB hold on top of the Stripe session's own window. Stripe
// enforces a ~30 minute floor on expires_at, so the session cannot be shortened
// to fit inside the hold; the hold is widened instead, and a payment landing in
// the session's last seconds still finds a live reservation.
export const CHECKOUT_HOLD_SLACK_SECONDS = 300
/**
 * Tolerance added when an expiry event decides whether a hold belongs to the
 * session that just expired.
 *
 * Without it the comparison is off by the sub-second remainder and never
 * matches: reserved_until is a timestamptz written with microsecond precision
 * (now() + TTL + slack), while Stripe's expires_at is whole Unix seconds, so
 * the DB value lands a few hundred milliseconds AFTER the bound computed from
 * it. Measured live: reserved_until 09:30:58.312185 against a bound of
 * 09:30:58, guard false, and checkout.session.expired silently released
 * nothing.
 *
 * A minute is far below the RESERVATION_TTL_SECONDS a genuinely newer session
 * pushes the hold out by, so the stale-session guard the bound exists for is
 * untouched, and it also absorbs ordinary clock skew between Stripe and here.
 */
export const RELEASE_BOUND_TOLERANCE_SECONDS = 60
export const TILE_SIZE = 50
