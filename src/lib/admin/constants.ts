// Shared constants for the /admin moderation console.
//
// The cookie *name* is owned by src/lib/security/admin-auth.ts
// (ADMIN_SESSION_COOKIE_NAME) - import it from there, not from here, so
// there's exactly one source of truth. This file only holds values that
// module doesn't already export.

export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12 // 12 hours - matches admin-auth's SESSION_DURATION_MS

export const ADMIN_LOGIN_PATH = '/admin/login'

export const ADMIN_LOGIN_RATE_LIMIT_MAX_REQUESTS = 5
export const ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60
