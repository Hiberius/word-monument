import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/security/admin-auth'
import { listModerationQueue } from '@/lib/db/moderation'

export async function GET(request: NextRequest) {
  const authorized = await requireAdmin(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cursorParam = request.nextUrl.searchParams.get('cursor')
  const cursor = cursorParam !== null && cursorParam !== '' ? Number(cursorParam) : undefined

  if (cursor !== undefined && !Number.isFinite(cursor)) {
    return NextResponse.json({ error: 'Invalid cursor.' }, { status: 400 })
  }

  const result = await listModerationQueue(cursor)
  return NextResponse.json(result)
}
