import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Pure factory - explicit credentials only, never reads process.env or
 * getCloudflareContext() internally. This is what makes it callable from
 * both Next.js route handlers (which have process.env) and the Cloudflare
 * scheduled() handler in custom-worker.ts (which only has env.*).
 */
export function createServiceRoleClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
