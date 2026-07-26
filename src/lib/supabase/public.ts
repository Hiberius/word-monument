import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * True once real Supabase credentials are configured. Every public read path
 * (the grid explorer, the homepage preview, live stats) should check this
 * before calling getSupabasePublic() and fall back to local demo data
 * (see @/lib/monument/demoData) instead of letting the throw below propagate
 * uncaught into a React effect or a server component render.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

/**
 * Anon-key client - safe for the browser AND server components. RLS denies
 * anon/authenticated on every base table; the only readable surfaces are
 * cells_public (a column-allowlist view), tile_summary, monument_stats, and
 * monument_stats. Never use this client for writes.
 */
export function getSupabasePublic(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'getSupabasePublic: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set'
    )
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
