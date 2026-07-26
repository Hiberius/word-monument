import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/security/admin-auth'
import { removeCell } from '@/lib/db/moderation'
import { parseCellId } from '@/lib/admin/parseId'

// There is no per-admin login (single shared password), so every action
// this console takes is attributed to the literal string "admin" in the
// audit log rather than an individual identity.
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

  let reason: unknown
  try {
    const body = await request.json()
    reason = (body as { reason?: unknown } | null)?.reason
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return NextResponse.json({ error: 'A reason is required to remove a cell.' }, { status: 400 })
  }

  try {
    const success = await removeCell(cellId, ADMIN_IDENTITY, reason.trim())

    if (!success) {
      return NextResponse.json({ error: 'Cell could not be removed.' }, { status: 409 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('POST /admin/api/cells/[id]/remove failed:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
