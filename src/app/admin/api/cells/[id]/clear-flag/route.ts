import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/security/admin-auth'
import { clearFlag } from '@/lib/db/moderation'
import { parseCellId } from '@/lib/admin/parseId'

const ADMIN_IDENTITY = 'admin'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorized = await requireAdmin(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const cellId = parseCellId(id)

  if (cellId === null) {
    return NextResponse.json({ error: 'Invalid cell id.' }, { status: 400 })
  }

  let note: unknown
  try {
    const body = await request.json()
    note = (body as { note?: unknown } | null)?.note
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (typeof note !== 'string') {
    return NextResponse.json({ error: 'A note is required to clear a flag.' }, { status: 400 })
  }

  try {
    await clearFlag(cellId, ADMIN_IDENTITY, note.trim())
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('POST /admin/api/cells/[id]/clear-flag failed:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
