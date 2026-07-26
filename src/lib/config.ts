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
export const TILE_SIZE = 50
