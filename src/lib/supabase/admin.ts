import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

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
