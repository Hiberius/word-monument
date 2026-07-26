import { NextResponse } from 'next/server'
import { sweepExpiredReservations } from '@/lib/db/sweep'
import { constantTimeEqual } from '@/lib/security/constant-time'

export async function POST(request: Request) {
  const providedSecret = request.headers.get('x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret || !providedSecret || !(await constantTimeEqual(providedSecret, expectedSecret))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('POST /api/cron/sweep: Supabase credentials are not configured')
    return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 })
  }

  try {
    const released = await sweepExpiredReservations(supabaseUrl, serviceRoleKey)
    return NextResponse.json({ released }, { status: 200 })
  } catch (err) {
    console.error('POST /api/cron/sweep failed:', err)
    return NextResponse.json({ error: 'Sweep failed.' }, { status: 500 })
  }
}
