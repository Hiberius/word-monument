import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * True once the SERVICE-ROLE credentials are configured. Write paths must gate
 * on this and not on isSupabaseConfigured(), which only sees the public
 * url/anon key and would report a missing service-role key as a deliberate
 * demo deployment instead of the misconfiguration it is.
 */
export function isSupabaseAdminConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/**
 * Convenience wrapper for route handlers, which have process.env populated
 * (unlike the bare scheduled() handler - see service-role.ts). Bypasses RLS
 * entirely; only ever call this from server-side code that has already
 * authorized the request (an API route, a webhook, an admin action).
 */
export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'getSupabaseAdmin: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set'
    )
  }

  return createServiceRoleClient(url, serviceRoleKey)
}
