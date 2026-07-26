import { getSupabaseAdmin } from '@/lib/supabase/admin'

const MAX_FAILED_ATTEMPTS = 10
const LOCKOUT_SECONDS = 15 * 60

function firstRow<T>(data: unknown): T | undefined {
  if (Array.isArray(data)) {
    return data[0] as T | undefined
  }
  return (data ?? undefined) as T | undefined
}

/**
 * KV-independent brute-force backstop for /admin/session. Call once per
 * login POST, AFTER bcrypt.compare has already run - passing the real
 * result means a correct password submitted during an active lockout is
 * still rejected, not just wrong-password attempts.
 *
 * Keyed per client (hashed IP) and atomic via Postgres row locking (see
 * admin_login_attempt in 0006_admin_lockout_per_ip.sql), so concurrent requests
 * from one client serialize instead of racing the KV rate limiter's non-atomic
 * read-modify-write - and one attacker can only lock out their own IP, never
 * the real operator.
 */
export async function recordAdminLoginAttempt(
  ipHash: string,
  passwordValid: boolean
): Promise<{ allowed: boolean; lockedUntil: string | null }> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.rpc('admin_login_attempt', {
    p_ip_hash: ipHash,
    p_password_valid: passwordValid,
    p_max_failed: MAX_FAILED_ATTEMPTS,
    p_lockout_seconds: LOCKOUT_SECONDS,
  })

  if (error) {
    // Fail closed here, unlike the KV rate limiter: if the DB backstop
    // itself is unreachable, reject the login rather than silently allowing
    // unlimited attempts through the one surface this table exists to
    // protect.
    console.error('[db/adminLoginLockout] admin_login_attempt RPC failed', error)
    return { allowed: false, lockedUntil: null }
  }

  const row = firstRow<{ allowed?: boolean; locked_until?: string | null }>(data)

  return {
    allowed: Boolean(row?.allowed),
    lockedUntil: row?.locked_until ?? null,
  }
}
